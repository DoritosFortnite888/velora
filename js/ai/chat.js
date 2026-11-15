// Chat logic: sending messages, streaming replies, stopping, regenerating and writing memory notes.
// Ported from the Swift ChatViewModel. UI code passes "listeners" and is told about every change.
import * as db from '../data/db.js';
import { LIMITS, INFERENCE } from '../core/config.js';
import { replyLength } from '../core/persona.js';
import { cleanReply } from '../core/format.js';
import { AGE_GATE, suggestsMinor } from '../core/safety.js';
import { buildChatMessages, buildSummaryMessages, buildRollingSummaryMessages, rollingSummaryStep } from '../core/prompt.js';
import { isDuplicateMemory } from '../core/memory.js';
import { newId, stamp } from '../core/util.js';
import { generate, EngineError } from './engine.js';
import { getDeviceReport } from './device.js';
import { selectedSpec, isDownloaded, modelFilesReady, ensureLoaded } from './model-store.js';

// Only one reply can be written at a time, because there is only one model in memory.
let current = null; // { conversationId, controller }

export const isGenerating = (conversationId) =>
  !!current && (!conversationId || current.conversationId === conversationId);

export function stopGeneration() {
  current?.controller.abort();
}

// Why a character cannot be chatted with yet, or null if chat is allowed.
export function chatBlockReason(character) {
  switch (character.ageGate) {
    case AGE_GATE.ADULT:
      return null;
    case AGE_GATE.FLAGGED:
      return "Chat is blocked: this character's details suggest they may be under 18. Edit the character to fix the text.";
    default:
      return "Confirm on this character's profile page that they are an adult (18+) to chat.";
  }
}

// Checks everything needed before a reply: age gate, device, and a downloaded model.
async function preflight(character) {
  const reason = chatBlockReason(character);
  if (reason) throw new Error(reason);

  const report = await getDeviceReport();
  if (!report.ok) {
    throw new EngineError(`This device cannot run the AI model. ${report.problems.join(' ')}`);
  }
  const spec = await selectedSpec();
  if (!(await isDownloaded(spec))) {
    throw new EngineError(`${spec.displayName} is not downloaded yet. Open Models and download it. It only needs to be downloaded once.`);
  }
  // Chat never starts a large download on its own. If the files were cleared, the user is asked first.
  if (!(await modelFilesReady(spec, report.hasF16))) {
    throw new EngineError(`The files for ${spec.displayName} are no longer on this device. Open Models and download them again (about ${spec.downloadMB} MB, estimate). Velora asks before any download.`);
  }
  return { spec, hasF16: report.hasF16 };
}

export function makeMessage(conversationId, isFromUser, text) {
  return { id: newId(), conversationId, isFromUser, text, createdAt: stamp() };
}

// Creates a new chat with the character's greeting, or returns the most recent chat.
export async function openConversation(character) {
  const existing = await db.listConversations(character.id);
  if (existing.length > 0) return existing[0];

  const openings = [character.greeting, ...(character.alternateGreetings ?? [])].filter(Boolean);
  const opening = openings[Math.floor(Math.random() * openings.length)] || "Hi there. What's on your mind?";

  const conversation = {
    id: newId(),
    characterId: character.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    summarizedCount: 0,
    preview: opening.slice(0, 120),
  };
  await db.saveConversation(conversation);
  await db.saveMessage(makeMessage(conversation.id, false, opening));
  return conversation;
}

// Sends the user's text and streams the reply.
export async function sendMessage({ conversation, character, text, listeners = {} }) {
  if (current) throw new Error('Velora is still writing a reply. Wait for it to finish, or tap stop.');
  const trimmed = text.trim();
  if (!trimmed) return;

  const context = await preflight(character);
  const userMessage = makeMessage(conversation.id, true, trimmed);
  await saveWithPreview(conversation, userMessage);
  listeners.onMessage?.(userMessage);

  await runReply({ conversation, character, context, listeners });
}

// Replaces the last AI reply with a new one written from the same user message.
export async function regenerateLast({ conversation, character, listeners = {} }) {
  if (current) throw new Error('Velora is still writing a reply. Wait for it to finish, or tap stop.');
  const context = await preflight(character);

  const messages = await db.listMessages(conversation.id);
  const last = messages[messages.length - 1];
  if (!last || last.isFromUser) throw new Error('There is no reply to regenerate yet.');

  await db.deleteMessage(last.id);
  listeners.onRemove?.(last.id);
  await runReply({ conversation, character, context, listeners });
}

async function runReply({ conversation, character, context, listeners }) {
  const controller = new AbortController();
  current = { conversationId: conversation.id, controller };

  const placeholder = makeMessage(conversation.id, false, '');
  await db.saveMessage(placeholder);
  listeners.onMessage?.(placeholder);

  let streamed = '';
  let succeeded = false;
  let lastSave = 0;

  try {
    listeners.onStatus?.('Preparing…');
    const history = (await db.listMessages(conversation.id)).filter((m) => m.id !== placeholder.id);
    const memories = await db.listMemories(character.id);
    const lastUser = [...history].reverse().find((m) => m.isFromUser)?.text ?? '';
    const length = replyLength(character, lastUser);
    // The prompt holds the recent messages, the memories that match the chat (see core/memory.js),
    // and a summary of older messages.
    const messages = buildChatMessages({
      character,
      history,
      memories,
      chatSummary: conversation.chatSummary ?? '',
      contextTokens: context.spec.contextWindow,
      replyTokens: length.maxTokens,
      lengthGuide: length.guide,
    });

    // Loads the model only if it is not already in memory. No artificial waiting: the reply starts
    // as soon as the model is ready.
    await ensureLoaded(context.spec, {
      hasF16: context.hasF16,
      onProgress: (p) => listeners.onStatus?.(describeProgress(p)),
    });
    if (controller.signal.aborted) {
      await removePlaceholder(placeholder, listeners);
      return;
    }
    listeners.onStatus?.('');

    const full = await generate(messages, {
      maxTokens: length.maxTokens,
      ...INFERENCE,
      stop: ['\nUser:', '\nuser:'],
      signal: controller.signal,
      onToken: (piece) => {
        streamed += piece;
        listeners.onToken?.(placeholder.id, cleanReply(streamed, character.name));
        // Save the partial reply now and then, so a closed app does not lose it.
        const now = Date.now();
        if (now - lastSave > 1500) {
          lastSave = now;
          placeholder.text = cleanReply(streamed, character.name);
          db.saveMessage(placeholder).catch(() => {});
        }
      },
    });

    const finalText = cleanReply(full, character.name);
    if (!finalText) {
      if (controller.signal.aborted) {
        await removePlaceholder(placeholder, listeners);
      } else {
        throw new EngineError('The model returned an empty reply. Try again.');
      }
    } else {
      placeholder.text = finalText;
      await saveWithPreview(conversation, placeholder);
      listeners.onFinal?.(placeholder.id, finalText);
      succeeded = true;
    }

    if (succeeded && !controller.signal.aborted) {
      await maybeRollSummary({ conversation, character, spec: context.spec, signal: controller.signal });
      await maybeSummarize({ conversation, character, spec: context.spec, signal: controller.signal });
    }
  } catch (err) {
    const partial = cleanReply(streamed, character.name);
    if (partial) {
      placeholder.text = partial;
      await db.saveMessage(placeholder).catch(() => {});
      listeners.onFinal?.(placeholder.id, partial);
    } else {
      await removePlaceholder(placeholder, listeners);
    }
    listeners.onError?.(err.message || 'Something went wrong.');
  } finally {
    current = null;
    listeners.onStatus?.('');
    listeners.onDone?.();
  }
}

async function removePlaceholder(placeholder, listeners) {
  await db.deleteMessage(placeholder.id).catch(() => {});
  listeners.onRemove?.(placeholder.id);
}

// Keeps the chat list preview up to date. Only non-empty text becomes the preview.
async function saveWithPreview(conversation, message) {
  await db.saveMessage(message);
  conversation.updatedAt = Date.now();
  if (message.text.trim()) conversation.preview = message.text.trim().slice(0, 120);
  await db.saveConversation(conversation);
}

// Keeps a running summary of messages that have fallen out of the prompt window. It is updated after
// a reply (not before one), so it does not slow down the next reply. Only the newly dropped messages
// are read, plus the existing summary.
async function maybeRollSummary({ conversation, character, spec, signal }) {
  const history = (await db.listMessages(conversation.id)).filter((m) => m.text.trim());
  const step = rollingSummaryStep(history, conversation.summaryThrough ?? 0);
  if (!step) return;

  let text = '';
  try {
    text = await generate(
      buildRollingSummaryMessages({
        character,
        previous: conversation.chatSummary ?? '',
        transcript: step.transcript,
        contextTokens: spec.contextWindow,
        replyTokens: LIMITS.rollingSummaryTokens,
      }),
      { maxTokens: LIMITS.rollingSummaryTokens, temperature: 0.3, topP: 0.9, signal },
    );
  } catch {
    return; // the summary is optional; a failure must not disturb the chat
  }
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!clean) return;
  conversation.chatSummary = clean;
  conversation.summaryThrough = step.to;
  await db.saveConversation(conversation);
}

// After enough new messages, asks the model for a few lasting facts and stores them as memories.
// Each memory records where it came from, and near-identical notes are not saved twice.
async function maybeSummarize({ conversation, character, spec, signal }) {
  const messages = await db.listMessages(conversation.id);
  const done = conversation.summarizedCount || 0;
  if (messages.length - done < LIMITS.summaryThreshold) return;

  const transcript = messages.slice(done).slice(-LIMITS.summaryTranscript);
  const existing = await db.listMemories(character.id);
  const prompt = buildSummaryMessages({
    character,
    transcript,
    existing,
    contextTokens: spec.contextWindow,
    replyTokens: LIMITS.summaryTokens,
  });

  let notes = '';
  try {
    notes = await generate(prompt, { maxTokens: LIMITS.summaryTokens, temperature: 0.4, topP: 0.9, signal });
  } catch {
    return; // memory notes are optional; a failure must not disturb the chat
  }

  const now = Date.now();
  for (const raw of notes.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('- ')) continue;
    const text = line.slice(2).trim().slice(0, 200);
    if (!text || /^nothing notable/i.test(text) || suggestsMinor(text)) continue;
    if (isDuplicateMemory(text, existing)) continue;
    const memory = {
      id: newId(),
      characterId: character.id,
      text,
      kind: 'summary',
      source: 'chat',
      conversationId: conversation.id,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    await db.saveMemory(memory);
    existing.push(memory);
  }
  conversation.summarizedCount = messages.length;
  await db.saveConversation(conversation);
}

function describeProgress(progress) {
  const percent = Math.round((progress.progress || 0) * 100);
  const text = progress.text ? ` ${progress.text}` : '';
  return `${percent}%${text}`;
}

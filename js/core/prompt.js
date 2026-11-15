// Builds the chat messages sent to the model.
// Ported from the Swift PromptBuilder. The phone's context window is fixed, so long character
// text and old messages are trimmed. The roleplay safety rules are never trimmed.
// The WebLLM library applies each model's own chat format, so this file returns role/content
// messages rather than hand-written chat markers.
import { LIMITS, LENGTHS } from './config.js';
import { roleplayRules } from './safety.js';
import { NATURAL_STYLE, CONTINUITY_RULES, contentMode, personaSection, identityLine, sceneRules } from './persona.js';
import { turnSection } from './reactions.js';
import { selectMemoryLines } from './memory.js';

// English text is about 4 characters per token. Counting 3 leaves a safety margin.
const CHARS_PER_TOKEN = 3;
// Rough allowance for the wrapping each message gets from the model's chat format.
const TURN_OVERHEAD = 40;
const SAFETY_MARGIN_TOKENS = 96;
// How many of the latest messages are used to decide which memories are relevant.
const QUERY_MESSAGES = 3;

// Shortens long text, keeping its start. Adds "..." when text is cut.
export function clip(text, limit) {
  if (text.length <= limit) return text;
  let cut = text.slice(0, limit);
  // Never leave half of a two-part emoji at the end.
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut + '...';
}

const clean = (text) => (text ?? '').trim();

function characterBudget(contextTokens, replyTokens) {
  return Math.max(600, (contextTokens - replyTokens - SAFETY_MARGIN_TOKENS) * CHARS_PER_TOKEN);
}

// Prompt for a normal reply. history must end with the user's latest message.
// lengthGuide is the instruction for how long this reply should be (see persona.js replyLength).
export function buildChatMessages({ character, history, memories, chatSummary, contextTokens, replyTokens, lengthGuide }) {
  const queryText = history.slice(-QUERY_MESSAGES).map((m) => m.text).join(' ');
  const system = systemPrompt(character, memories, lengthGuide ?? LENGTHS.short.guide, history, chatSummary);
  const postHistory = clip(clean(character.postHistoryInstructions), 300);

  let remaining = characterBudget(contextTokens, replyTokens) - system.length - postHistory.length;
  const recent = history.slice(-LIMITS.maxHistoryMessages);
  const turns = [];

  // Walk backwards from the newest message and keep as many as fit.
  for (let i = recent.length - 1; i >= 0; i--) {
    const message = recent[i];
    const text = clip(message.text, 1200);
    const cost = text.length + TURN_OVERHEAD;
    // The newest message (the user's words) is always kept, even if it is long.
    const isNewest = i === recent.length - 1;
    if (!isNewest && cost > remaining) break;
    remaining -= cost;
    turns.unshift({ role: message.isFromUser ? 'user' : 'assistant', content: text });
  }

  const messages = [{ role: 'system', content: system }, ...turns];
  if (postHistory) {
    const last = messages[messages.length - 1];
    if (last.role === 'user') {
      last.content += `\n\n[Note for your next reply: ${postHistory}]`;
    } else {
      messages.push({ role: 'system', content: postHistory });
    }
  }
  return messages;
}

// Prompt that asks the model to write short memory notes after a long chat.
// existing: memories already saved for this character, so the model does not write them again.
export function buildSummaryMessages({ character, transcript, existing = [], contextTokens, replyTokens }) {
  const known = existing
    .slice(-12)
    .map((m) => clip(String(m.text ?? '').trim(), 120))
    .filter(Boolean);
  const system = [
    'You write memory notes for a roleplay app.',
    `Read the conversation below and list up to three lasting facts: things the user shared about themselves, their preferences, promises, shared events, and how the relationship with ${character.name} changed.`,
    "Write one short plain sentence per line, each starting with '- '.",
    'Only write what the conversation actually says. Do not invent anything.',
    known.length ? `These notes are already saved, so do not repeat them: ${known.join(' | ')}.` : '',
    'Do not include sexual content.',
    "If nothing lasting happened, write '- Nothing notable.'",
  ].filter(Boolean).join(' ');

  let remaining = characterBudget(contextTokens, replyTokens) - system.length;
  const lines = [];
  for (let i = transcript.length - 1; i >= 0; i--) {
    const message = transcript[i];
    const speaker = message.isFromUser ? 'user' : character.name;
    const line = `${speaker}: ${clip(message.text, 400)}`;
    if (line.length + 1 > remaining) break;
    remaining -= line.length + 1;
    lines.unshift(line);
  }
  return [
    { role: 'system', content: system },
    { role: 'user', content: lines.join('\n') },
  ];
}

// Decides whether older messages that have left the prompt window need a new summary.
// history: every saved message in order (oldest first), including the newest user message.
// summaryThrough: how many of the oldest messages the current summary already covers.
// Returns { from, to, transcript } for the messages to summarise next, or null when nothing is due.
export function rollingSummaryStep(history, summaryThrough = 0) {
  const dropped = Math.max(0, history.length - LIMITS.maxHistoryMessages);
  const covered = Math.max(0, summaryThrough);
  if (dropped - covered < LIMITS.rollingSummaryBatch) return null;
  const to = Math.min(dropped, covered + LIMITS.rollingSummaryChunk);
  return { from: covered, to, transcript: history.slice(covered, to) };
}

// Prompt that folds newly dropped messages into the running summary of this chat.
export function buildRollingSummaryMessages({ character, previous = '', transcript, contextTokens, replyTokens }) {
  const system = [
    `You keep a running summary of a roleplay chat between a user and ${character.name}.`,
    'Write one short paragraph, in the third person, of the events, facts, promises and feelings that matter for later replies.',
    previous ? 'Update the existing summary below with the new messages. Keep what is still true, and drop nothing important.' : 'Summarise the messages below.',
    'Only write what the chat actually says. Do not invent anything. Do not include sexual content.',
  ].join(' ');

  let remaining = characterBudget(contextTokens, replyTokens) - system.length;
  const lines = [];
  for (let i = transcript.length - 1; i >= 0; i--) {
    const message = transcript[i];
    const speaker = message.isFromUser ? 'user' : character.name;
    const line = `${speaker}: ${clip(message.text, 400)}`;
    if (line.length + 1 > remaining) break;
    remaining -= line.length + 1;
    lines.unshift(line);
  }
  const body = [
    previous ? `Existing summary: ${clip(previous, 900)}` : '',
    'New messages:',
    lines.join('\n'),
  ].filter(Boolean).join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: body },
  ];
}

// The system prompt, in a fixed order. The character comes first, the scene and style next, the
// direction for this reply after that, and the safety rules last, so they are the final thing read.
function systemPrompt(character, memories, lengthGuide, history, chatSummary) {
  const sections = [];
  const mode = contentMode(character);
  const queryText = history.slice(-QUERY_MESSAGES).map((m) => m.text).join(' ');

  sections.push(identityLine(character.name));

  const custom = clip(clean(character.systemPrompt), 700);
  if (custom) sections.push(custom);

  const tagline = clip(clean(character.tagline), 120);
  if (tagline) sections.push(`Who ${character.name} is: ${tagline}.`);

  const notes = clip(clean(character.personality), 300);
  if (notes) sections.push(`Personality notes: ${notes}`);

  const backstory = clip(clean(character.backstory), 400);
  if (backstory) sections.push(`Background: ${backstory}`);

  const scenario = clip(clean(character.scenario), 300);
  if (scenario) sections.push(`Current scenario: ${scenario}`);

  const examples = clip(clean(character.exampleDialogue), 400);
  if (examples) sections.push(`Example of how ${character.name} talks:\n${examples}`);

  const extra = clip(clean(character.customInstructions), 300);
  if (extra) sections.push(`Extra instructions: ${extra}`);

  // The memories most relevant to what is being discussed, plus any pinned ones. Written oldest first.
  const memoryLines = selectMemoryLines(memories, {
    query: queryText,
    limit: LIMITS.maxMemories,
    charBudget: LIMITS.memoryChars,
  });
  if (memoryLines.length) {
    sections.push(
      'What you remember about the user and your shared history. Use these when they fit. Do not invent other shared history:\n' +
        memoryLines.join('\n'),
    );
  }

  // The running summary of older messages in this chat, so references to earlier events still work.
  const summary = clip(clean(chatSummary), 900);
  if (summary) {
    sections.push(
      'Earlier in this chat (a summary of messages no longer shown in full). Stay consistent with it:\n' + summary,
    );
  }

  sections.push(sceneRules(character.name));
  sections.push(CONTINUITY_RULES);
  sections.push(NATURAL_STYLE);
  sections.push(personaSection(character, mode));
  // What the user's latest message means in the scene, how the character reacts, and what to avoid.
  sections.push(turnSection(character, history));
  sections.push(`Length of this reply: ${lengthGuide}`);

  // Safety rules come last and are never removed.
  sections.push(roleplayRules(mode.mode));
  return sections.join('\n\n');
}

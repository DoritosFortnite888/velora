// Builds the chat messages sent to the model.
// Ported from the Swift PromptBuilder. The phone's context window is fixed, so long character
// text and old messages are trimmed. The roleplay safety rules are never trimmed.
// The WebLLM library applies each model's own chat format, so this file returns role/content
// messages rather than hand-written chat markers.
import { LIMITS, LENGTHS } from './config.js';
import { roleplayRules } from './safety.js';
import { NATURAL_STYLE, contentMode, personaSection } from './persona.js';

// English text is about 4 characters per token. Counting 3 leaves a safety margin.
const CHARS_PER_TOKEN = 3;
// Rough allowance for the wrapping each message gets from the model's chat format.
const TURN_OVERHEAD = 40;
const SAFETY_MARGIN_TOKENS = 96;

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
export function buildChatMessages({ character, history, memories, contextTokens, replyTokens, lengthGuide }) {
  const system = systemPrompt(character, memories, lengthGuide ?? LENGTHS.short.guide);
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
export function buildSummaryMessages({ character, transcript, contextTokens, replyTokens }) {
  const system = [
    'You write memory notes for a roleplay app.',
    `Read the conversation below and list up to three lasting facts: things the user shared about themselves, promises, shared events, and how the relationship with ${character.name} changed.`,
    "Write one short plain sentence per line, each starting with '- '.",
    'Do not include sexual content.',
    "If nothing lasting happened, write '- Nothing notable.'",
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
  return [
    { role: 'system', content: system },
    { role: 'user', content: lines.join('\n') },
  ];
}

function systemPrompt(character, memories, lengthGuide) {
  const sections = [];
  const mode = contentMode(character);

  const custom = clip(clean(character.systemPrompt), 700);
  sections.push(custom || `You are roleplaying as ${character.name}. Stay in character at all times.`);

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

  // Newest memories first until the memory budget is used. They are then shown oldest first.
  const memoryLines = [];
  let used = 0;
  for (const memory of memories.slice(-LIMITS.maxMemories).reverse()) {
    const line = '- ' + clip(memory.text, 200);
    if (used + line.length > 700) break;
    used += line.length + 1;
    memoryLines.unshift(line);
  }
  if (memoryLines.length) {
    sections.push(
      'Shared history with the user. Remember these and refer to them naturally when it fits:\n' +
        memoryLines.join('\n'),
    );
  }

  sections.push(NATURAL_STYLE);
  sections.push(personaSection(character, mode));
  sections.push(`Length of this reply: ${lengthGuide}`);

  // Safety rules come last and are never removed.
  sections.push(roleplayRules(mode.mode));
  return sections.join('\n\n');
}

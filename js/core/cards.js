// Reads character cards: V1 and V2 JSON, PNG cards with embedded JSON, and pasted text.
// Ported from the Swift CharacterCardImporter. Works on plain bytes, so it runs in Node tests.
import { suggestsMinor, AGE_GATE } from './safety.js';
import { newCharacterRecord } from './characters.js';
import { bytesToBase64 } from './util.js';

export const CARD_ERRORS = {
  invalidJSON: 'This file is not a character card. Use a JSON card or a PNG card.',
  noName: 'The card has no character name.',
  noPNG: 'This PNG does not contain character card data.',
  nothing: 'Paste a card or some text first.',
};

export class CardError extends Error {}

// A parsed card before it is saved. Fields match the card format.
export function newCard(fields = {}) {
  return {
    name: '',
    description: '',
    personality: '',
    scenario: '',
    firstMessage: '',
    exampleDialogue: '',
    systemPrompt: '',
    postHistoryInstructions: '',
    alternateGreetings: [],
    tags: [],
    creator: '',
    format: 'pasted',
    notes: [],
    avatar: null,
    ...fields,
  };
}

// All text in the card, used for the minor-signal check.
export function allCardText(card) {
  return [
    card.name, card.description, card.personality, card.scenario, card.firstMessage,
    card.exampleDialogue, card.systemPrompt, card.postHistoryInstructions,
    ...card.alternateGreetings,
  ].join('\n');
}

// First sentence of the description, used as the short tagline (up to 100 characters).
export function taglineOf(card) {
  const firstSentence = (card.description || '').split(/[.!?\n]/)[0] ?? '';
  return firstSentence.trim().slice(0, 100);
}

// Turns a parsed card into a saved character record.
// Imported cards start unconfirmed, so the user must confirm they are an adult.
// trustedAdult is only used for the built-in examples.
export function cardToCharacter(card, { trustedAdult = false } = {}) {
  let gate;
  if (suggestsMinor(allCardText(card))) gate = AGE_GATE.FLAGGED;
  else if (trustedAdult) gate = AGE_GATE.ADULT;
  else gate = AGE_GATE.UNCONFIRMED;

  return newCharacterRecord({
    name: card.name,
    tagline: taglineOf(card),
    personality: card.personality,
    backstory: card.description,
    greeting: card.firstMessage || "Hi. What's on your mind?",
    avatar: card.avatar,
    scenario: card.scenario,
    exampleDialogue: card.exampleDialogue,
    systemPrompt: card.systemPrompt,
    postHistoryInstructions: card.postHistoryInstructions,
    alternateGreetings: card.alternateGreetings,
    tags: card.tags,
    creator: card.creator,
    sourceFormat: card.format,
    ageGate: gate,
  });
}

// ---------- Entry points ----------

// Reads a file: PNG cards are detected by their signature, everything else is treated as JSON.
export function parseCardFile(bytes) {
  if (isPNG(bytes)) return parsePNG(bytes);
  return parseJSONBytes(bytes);
}

export function parseJSONBytes(bytes) {
  const text = new TextDecoder('utf-8').decode(bytes);
  return parseJSONText(text);
}

function parseJSONText(text) {
  let object;
  try {
    object = JSON.parse(text);
  } catch {
    throw new CardError(CARD_ERRORS.invalidJSON);
  }
  if (!isObject(object)) throw new CardError(CARD_ERRORS.invalidJSON);
  return parseObject(object);
}

// Accepts pasted JSON, or plain text. Plain text becomes the description.
// If the first line is "Name: Something", that line sets the name.
export function parsePasted(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) throw new CardError(CARD_ERRORS.nothing);

  if (trimmed.startsWith('{')) {
    try {
      return parseJSONText(trimmed);
    } catch {
      // fall through: treat it as plain text
    }
  }
  return parseDescription(trimmed);
}

// Reads one card object (V1 flat, or V2 wrapped in "data").
export function parseObject(root) {
  const wrapped = isObject(root.data) ? root.data : null;
  const source = wrapped ?? root;
  const spec = typeof root.spec === 'string' ? root.spec : '';

  let format;
  if (spec.startsWith('chara_card_v3')) format = 'card-v3';
  else if (spec.startsWith('chara_card_v2') || wrapped) format = 'card-v2';
  else format = 'card-v1';

  const rawName = str(source.name).trim();
  if (!rawName) throw new CardError(CARD_ERRORS.noName);

  const text = (key) => replaceMacros(str(source[key]), rawName);

  const alternates = strArray(source.alternate_greetings).map((g) => replaceMacros(g, rawName));
  const tags = strArray(source.tags).map((t) => t.trim()).filter(Boolean);

  const notes = [];
  const book = source.character_book;
  if (isObject(book) && Array.isArray(book.entries) && book.entries.length > 0) {
    notes.push(`This card has ${book.entries.length} lorebook entries. They are not imported yet.`);
  }

  return newCard({
    name: rawName,
    description: text('description'),
    personality: text('personality'),
    scenario: text('scenario'),
    firstMessage: text('first_mes'),
    exampleDialogue: text('mes_example'),
    systemPrompt: text('system_prompt'),
    postHistoryInstructions: text('post_history_instructions'),
    alternateGreetings: alternates,
    tags,
    creator: str(source.creator),
    format,
    notes,
  });
}

// Replaces the common placeholders used in character cards.
export function replaceMacros(text, name) {
  return text
    .replace(/\{\{char\}\}/gi, () => name)
    .replace(/\{\{user\}\}/gi, () => 'you')
    .replace(/<BOT>/g, () => name)
    .replace(/<USER>/g, () => 'you');
}

// "Name: X" on the first line sets the name. The rest becomes the description.
export function parseDescription(text) {
  let name = 'Imported character';
  let description = text;
  const lines = text.split(/\r\n|\r|\n/);
  const first = lines[0] ?? '';
  if (first.toLowerCase().startsWith('name:')) {
    const typed = first.slice(5).trim();
    if (typed) name = typed;
    description = lines.slice(1).join('\n').trim();
  }
  return newCard({ name, description, format: 'pasted' });
}

// ---------- PNG cards ----------

export function isPNG(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return signature.every((byte, i) => bytes[i] === byte);
}

// Reads the card JSON stored in a PNG's text chunks ("ccv3" or "chara", base64 encoded).
export function parsePNG(bytes) {
  const texts = {};
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUInt32(bytes, offset);
    const typeStart = offset + 4;
    const bodyStart = offset + 8;
    if (bodyStart + length > bytes.length) break;

    const type = String.fromCharCode(...bytes.subarray(typeStart, bodyStart));
    const body = bytes.subarray(bodyStart, bodyStart + length);
    if (type === 'tEXt') {
      const pair = parseTEXt(body);
      if (pair) texts[pair.key] = pair.value;
    }
    if (type === 'iTXt') {
      const pair = parseITXt(body);
      if (pair) texts[pair.key] = pair.value;
    }
    if (type === 'IEND') break;
    offset = bodyStart + length + 4; // skip the CRC
  }

  const encoded = texts.ccv3 ?? texts.chara;
  if (!encoded) throw new CardError(CARD_ERRORS.noPNG);

  let json;
  try {
    const binary = atob(encoded.replace(/\s+/g, ''));
    json = new TextDecoder('utf-8').decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    throw new CardError(CARD_ERRORS.noPNG);
  }

  const card = parseJSONText(json);
  card.format = 'png-' + card.format;
  card.avatar = 'data:image/png;base64,' + bytesToBase64(bytes);
  return card;
}

function readUInt32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

const utf8 = (bytes) => new TextDecoder('utf-8').decode(bytes);

// tEXt chunk: keyword, a zero byte, then the text.
function parseTEXt(body) {
  const separator = body.indexOf(0);
  if (separator < 0) return null;
  return {
    key: utf8(body.subarray(0, separator)).toLowerCase(),
    value: utf8(body.subarray(separator + 1)),
  };
}

// iTXt chunk: keyword, flags, language and translated keyword, then text. Compressed text is not supported.
function parseITXt(body) {
  const separator = body.indexOf(0);
  if (separator < 0) return null;
  const key = utf8(body.subarray(0, separator)).toLowerCase();
  let index = separator + 1;
  if (index + 2 > body.length) return null;
  const compressed = body[index] === 1;
  index += 2;
  if (compressed) return null;
  const languageEnd = body.indexOf(0, index);
  if (languageEnd < 0) return null;
  index = languageEnd + 1;
  const translatedEnd = body.indexOf(0, index);
  if (translatedEnd < 0) return null;
  index = translatedEnd + 1;
  return { key, value: utf8(body.subarray(index)) };
}

// ---------- helpers ----------

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function str(value) {
  return typeof value === 'string' ? value : '';
}
function strArray(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
}

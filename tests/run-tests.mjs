// Tests for the pure logic: safety rules, prompt limits, card import, examples.
// Run with:  node tests/run-tests.mjs   (or: npm test)
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { suggestsMinor, AGE_GATE, roleplayRules } from '../js/core/safety.js';
import * as configModule from '../js/core/config.js';
import {
  clip, buildChatMessages, buildSummaryMessages, buildRollingSummaryMessages, rollingSummaryStep,
} from '../js/core/prompt.js';
import {
  parsePasted, parseObject, parseCardFile, cardToCharacter, replaceMacros, taglineOf,
  isPNG,
} from '../js/core/cards.js';
import { loadExampleCards, exampleToCharacter } from '../js/core/examples.js';
import { starterCharacters } from '../js/core/starters.js';
import { newCharacterRecord } from '../js/core/characters.js';
import { timeAgo, initialsOf, hueFromString } from '../js/core/util.js';
import { intensityLevel, contentMode, personaSection, replyLength, NATURAL_STYLE, CONTINUITY_RULES, ADULT_MIN_AGE, identityLine, sceneRules } from '../js/core/persona.js';
import { parseLine, parseRoleplay, renderRoleplayHTML, cleanReply, ACTION_MAX_CHARS } from '../js/core/format.js';
import { upgradeCharacter, FICTIONAL_AGES } from '../js/core/migrate.js';
import {
  LENGTHS, PERSONALITY_TRAITS, MODELS, DEFAULT_MODEL_ID, LIMITS,
  INFERENCE, MEMORY_KINDS, MEMORY_KIND_WEIGHT,
} from '../js/core/config.js';
import { selectMemoryLines, isDuplicateMemory, wordsOf, normalizeMemoryText, stemWord } from '../js/core/memory.js';
import { classifyMessage, turnSection, repetitionNotes, lengthHint, personalityDirection } from '../js/core/reactions.js';
import { normaliseRoleplayText } from '../js/core/format.js';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`  FAIL ${name}\n       ${err.message.split('\n')[0]}`);
  }
}

// Builds a PNG file in memory with one text chunk. The parser does not check CRCs, so zeros are fine.
function makePNG(keyword, text, { itxt = false } = {}) {
  const enc = new TextEncoder();
  const chunk = (type, body) => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    out.set(enc.encode(type), 4);
    out.set(body, 8);
    return out;
  };
  const sig = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const kw = enc.encode(keyword);
  let body;
  if (itxt) {
    const lang = new Uint8Array(0);
    const trans = new Uint8Array(0);
    body = new Uint8Array([...kw, 0, 0, 0, ...lang, 0, ...trans, 0, ...enc.encode(text)]);
    return concat([sig, chunk('iTXt', body), chunk('IEND', new Uint8Array(0))]);
  }
  body = new Uint8Array([...kw, 0, ...enc.encode(text)]);
  return concat([sig, chunk('tEXt', body), chunk('IEND', new Uint8Array(0))]);
}
function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');

console.log('\nSafety');
test('digit ages under 18 are flagged', () => {
  assert.ok(suggestsMinor('She is 17 years old and in class'));
  assert.ok(suggestsMinor('a 16-year-old student'));
});
test('spelled-out ages are flagged', () => {
  assert.ok(suggestsMinor('She is sixteen years old'));
  assert.ok(suggestsMinor('a seventeen-year-old student'));
});
test('school references are flagged', () => {
  assert.ok(suggestsMinor('He attends high school in Ohio'));
});
test('adult ages are not flagged', () => {
  assert.equal(suggestsMinor('She is 18 years old, a pilot'), false);
  assert.equal(suggestsMinor('A 34 year old chef'), false);
  assert.equal(suggestsMinor('He is thirty years old and a chef'), false);
});
test('friendly mode forbids romance, adult mode allows it but never explicit content', () => {
  assert.ok(roleplayRules('friendly').includes('non-romantic'));
  assert.ok(roleplayRules('adult').includes('Flirting, romance'));
  assert.ok(roleplayRules('adult').includes('Never write sexually explicit content'));
  assert.ok(roleplayRules('adult').includes('under 18'));
});

console.log('\nPrompt');
test('clip shortens long text and marks the cut', () => {
  assert.equal(clip('abc', 10), 'abc');
  assert.equal(clip('abcdef', 3), 'abc...');
});
test('clip never splits an emoji', () => {
  const out = clip('ab\u{1F600}cd', 3);
  assert.equal(out, 'ab...');
});
test('a very long prompt stays inside the context and keeps the safety rules', () => {
  const character = newCharacterRecord({
    name: 'Test',
    systemPrompt: 'Long rule. '.repeat(500),
    ageGate: AGE_GATE.ADULT,
    statedAge: 30, // adult mode, so the adult rules are the ones that must survive trimming
  });
  const history = Array.from({ length: 40 }, (_, i) => ({
    isFromUser: i % 2 === 1, // history always ends with the user's message
    text: 'word '.repeat(200),
  }));
  const messages = buildChatMessages({
    character, history, memories: [], contextTokens: 2048, replyTokens: 400,
  });
  const joined = messages.map((m) => m.content).join('\n');
  assert.ok(joined.includes('Roleplay rules:'));
  assert.ok(joined.includes('Never write sexually explicit content'));
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[messages.length - 1].role, 'user');
  assert.ok(joined.length < 2048 * 3, `prompt too long: ${joined.length}`);
});
test('the newest user message is always kept', () => {
  const character = newCharacterRecord({ name: 'Mira', ageGate: AGE_GATE.ADULT });
  const history = [{ isFromUser: true, text: 'hello there' }];
  const messages = buildChatMessages({
    character, history, memories: [], contextTokens: 4096, replyTokens: 400,
  });
  assert.equal(messages.at(-1).content, 'hello there');
});
test('chosen personality traits are included in the prompt', () => {
  const character = newCharacterRecord({ name: 'Mira', personalityTraits: ['gentle'], ageGate: AGE_GATE.ADULT });
  const messages = buildChatMessages({
    character, history: [{ isFromUser: true, text: 'hi' }], memories: [],
    contextTokens: 4096, replyTokens: 400,
  });
  assert.ok(messages[0].content.includes('Gentle and patient'));
});
test('the post-history reminder is attached to the last user message', () => {
  const character = newCharacterRecord({ name: 'Mira', postHistoryInstructions: 'Keep it short.' });
  const messages = buildChatMessages({
    character, history: [{ isFromUser: true, text: 'hi' }], memories: [],
    contextTokens: 4096, replyTokens: 400,
  });
  assert.ok(messages.at(-1).content.includes('Keep it short.'));
});
test('memories are included, newest kept when there are too many', () => {
  const character = newCharacterRecord({ name: 'Mira', ageGate: AGE_GATE.ADULT });
  const memories = Array.from({ length: 30 }, (_, i) => ({ text: `memory ${i}` }));
  const messages = buildChatMessages({
    character, history: [{ isFromUser: true, text: 'hi' }], memories,
    contextTokens: 4096, replyTokens: 400,
  });
  assert.ok(messages[0].content.includes('memory 29'));
  assert.ok(!messages[0].content.includes('memory 0\n'));
});
test('the memory summary prompt has a system and a user message', () => {
  const character = newCharacterRecord({ name: 'Mira' });
  const messages = buildSummaryMessages({
    character,
    transcript: [{ isFromUser: true, text: 'I moved to Leeds.' }, { isFromUser: false, text: 'Leeds!' }],
    contextTokens: 4096, replyTokens: 200,
  });
  assert.equal(messages[0].role, 'system');
  assert.ok(messages[0].content.includes("'- '"));
  assert.ok(messages[1].content.includes('user: I moved to Leeds.'));
});

console.log('\nCard import');
test('V2 JSON card is read', () => {
  const card = parsePasted(JSON.stringify({
    spec: 'chara_card_v2', spec_version: '2.0',
    data: { name: 'Mira', description: 'A librarian. Quiet.', personality: 'Calm',
      first_mes: 'Hello {{user}}', tags: ['cozy'], alternate_greetings: ['Hi again, {{char}}'] },
  }));
  assert.equal(card.name, 'Mira');
  assert.equal(card.format, 'card-v2');
  assert.equal(card.firstMessage, 'Hello you');
  assert.deepEqual(card.alternateGreetings, ['Hi again, Mira']);
  assert.deepEqual(card.tags, ['cozy']);
  assert.equal(taglineOf(card), 'A librarian');
});
test('V1 flat card is read', () => {
  const card = parsePasted('{"name":"Kai","description":"A coach.","first_mes":"Ready?"}');
  assert.equal(card.name, 'Kai');
  assert.equal(card.format, 'card-v1');
  assert.equal(taglineOf(card), 'A coach');
});
test('a card file without a name is rejected', () => {
  const bytes = new TextEncoder().encode('{"description":"No name here."}');
  assert.throws(() => parseCardFile(bytes), /no character name/);
});
test('invalid JSON is rejected with a clear message', () => {
  assert.throws(() => parseCardFile(new TextEncoder().encode('not json')), /not a character card/);
});
test('a PNG card is read from its tEXt chunk', () => {
  const json = '{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":"Nova","description":"Navigator."}}';
  const png = makePNG('chara', b64(json));
  assert.ok(isPNG(png));
  const card = parseCardFile(png);
  assert.equal(card.name, 'Nova');
  assert.equal(card.format, 'png-card-v2');
  assert.ok(card.avatar.startsWith('data:image/png;base64,'));
});
test('a PNG card is read from an iTXt chunk', () => {
  const json = '{"name":"Lyra","description":"A pilot."}';
  const png = makePNG('ccv3', b64(json), { itxt: true });
  const card = parseCardFile(png);
  assert.equal(card.name, 'Lyra');
});
test('a PNG without card data is rejected', () => {
  const png = makePNG('Comment', 'hello');
  assert.throws(() => parseCardFile(png), /does not contain character card data/);
});
test('"Name:" on the first line sets the name', () => {
  const card = parsePasted('Name: Theo\nA bookshop owner who loves rain.');
  assert.equal(card.name, 'Theo');
  assert.ok(card.description.startsWith('A bookshop'));
});
test('pasted JSON is detected', () => {
  const card = parsePasted('{"name":"Lyra","description":"A pilot."}');
  assert.equal(card.name, 'Lyra');
  assert.equal(card.format, 'card-v1');
});
test('an empty paste is rejected', () => {
  assert.throws(() => parsePasted('   '), /Paste a card/);
});
test('imported cards start unconfirmed, examples are trusted', () => {
  const card = parsePasted('Name: Test\nA friendly guide.');
  assert.equal(cardToCharacter(card).ageGate, AGE_GATE.UNCONFIRMED);
  assert.equal(cardToCharacter(card, { trustedAdult: true }).ageGate, AGE_GATE.ADULT);
});
test('a card that mentions a 16-year-old is flagged even when trusted', () => {
  const card = parsePasted('Name: Test\nA 16 years old student.');
  assert.equal(cardToCharacter(card, { trustedAdult: true }).ageGate, AGE_GATE.FLAGGED);
});
test('macros are replaced', () => {
  assert.equal(replaceMacros('{{char}} and {{user}} <BOT> <USER>', 'Mira'), 'Mira and you Mira you');
});
test('parseObject keeps lorebook notes', () => {
  const card = parseObject({ name: 'X', data: { name: 'X', character_book: { entries: [{}, {}] } } });
  assert.equal(card.notes.length, 1);
});

console.log('\nExamples and starters');
test('all eight example characters load', () => {
  assert.equal(loadExampleCards().length, 8);
});
test('example characters are trusted adults and have unique names', () => {
  const cards = loadExampleCards();
  const names = new Set(cards.map((c) => c.name));
  assert.equal(names.size, cards.length);
  for (const card of cards) {
    assert.equal(exampleToCharacter(card).ageGate, AGE_GATE.ADULT, card.name);
  }
});
test('three starter characters are adults', () => {
  const starters = starterCharacters();
  assert.equal(starters.length, 3);
  assert.deepEqual(starters.map((s) => s.name), ['Mira', 'Kai', 'Nova']);
  assert.ok(starters.every((s) => s.ageGate === AGE_GATE.ADULT));
});

console.log('\nUtilities');
test('timeAgo formats recent times', () => {
  const now = 10_000_000;
  assert.equal(timeAgo(now - 5_000, now), 'just now');
  assert.equal(timeAgo(now - 5 * 60_000, now), '5 min ago');
  assert.equal(timeAgo(now - 3 * 3_600_000, now), '3 h ago');
});
test('initials are made from the first letters of up to two words', () => {
  assert.equal(initialsOf('Captain Lyra Voss'), 'CL');
  assert.equal(initialsOf('mira'), 'M');
});
test('a name always gives the same hue', () => {
  assert.equal(hueFromString('Mira'), hueFromString('Mira'));
});

console.log('\nRoleplay: natural style, personality, romance level');
test('the natural style guide asks for short, human replies and asterisk actions', () => {
  assert.ok(NATURAL_STYLE.includes('Use contractions'));
  assert.ok(NATURAL_STYLE.includes('1 to 4 sentences'));
  assert.ok(NATURAL_STYLE.includes('*asterisks*'));
  assert.ok(NATURAL_STYLE.includes('Never write the user'));
  assert.ok(NATURAL_STYLE.includes('Do not reuse phrases'));
});
test('the style guide is in every prompt, and safety rules stay last', () => {
  const character = newCharacterRecord({ name: 'Mira', ageGate: AGE_GATE.ADULT, statedAge: 29 });
  const messages = buildChatMessages({
    character, history: [{ isFromUser: true, text: 'hi' }], memories: [],
    contextTokens: 4096, replyTokens: 400, lengthGuide: LENGTHS.short.guide,
  });
  const system = messages[0].content;
  assert.ok(system.includes('How to talk:'));
  assert.ok(system.indexOf('How to talk:') < system.indexOf('Roleplay rules:'));
  assert.ok(system.trimEnd().endsWith(roleplayRules('adult').trimEnd()));
});

test('romance needs a confirmed adult with a stated age of 18 or more', () => {
  const base = { name: 'Mira', romanceIntensity: 50 };
  assert.equal(contentMode(newCharacterRecord({ ...base, ageGate: AGE_GATE.ADULT, statedAge: 29 })).mode, 'adult');
  assert.equal(contentMode(newCharacterRecord({ ...base, ageGate: AGE_GATE.ADULT, statedAge: null })).reason, 'age-unclear');
  assert.equal(contentMode(newCharacterRecord({ ...base, ageGate: AGE_GATE.ADULT, statedAge: 17 })).reason, 'age-unclear');
  assert.equal(contentMode(newCharacterRecord({ ...base, ageGate: AGE_GATE.UNCONFIRMED, statedAge: 29 })).reason, 'not-confirmed');
  assert.equal(contentMode(newCharacterRecord({ ...base, ageGate: AGE_GATE.FLAGGED, statedAge: 29 })).mode, 'friendly');
});
test('an unclear or missing age never unlocks romance, even at the highest level', () => {
  const character = newCharacterRecord({ name: 'Mira', ageGate: AGE_GATE.ADULT, statedAge: undefined, romanceIntensity: 100 });
  const mode = contentMode(character);
  assert.equal(mode.mode, 'friendly');
  const text = personaSection(character, mode);
  assert.ok(text.includes('not allowed'));
  assert.ok(!text.includes('Romance level'));
});
test('romance level 0 keeps a confirmed adult friendly', () => {
  const character = newCharacterRecord({ name: 'Mira', ageGate: AGE_GATE.ADULT, statedAge: 30, romanceIntensity: 0 });
  assert.equal(contentMode(character).reason, 'off');
});
test('the romance slider maps to the four levels', () => {
  assert.equal(intensityLevel(0).key, 'off');
  assert.equal(intensityLevel(1).key, 'light');
  assert.equal(intensityLevel(24).key, 'light');
  assert.equal(intensityLevel(25).key, 'romantic');
  assert.equal(intensityLevel(59).key, 'romantic');
  assert.equal(intensityLevel(60).key, 'intense');
  assert.equal(intensityLevel(100).key, 'intense');
  assert.equal(intensityLevel('not a number').key, 'romantic'); // falls back to the default of 30
  assert.equal(intensityLevel(500).key, 'intense');             // clamped
});
test('the intense level still forbids explicit content', () => {
  const character = newCharacterRecord({ name: 'Mira', ageGate: AGE_GATE.ADULT, statedAge: 30, romanceIntensity: 90 });
  const text = personaSection(character);
  assert.ok(text.includes('Intense'));
  assert.ok(text.includes('fade out'));
});
test('every personality trait can be chosen, and unknown traits are ignored', () => {
  const all = Object.keys(PERSONALITY_TRAITS);
  for (const key of ['shy', 'confident', 'playful', 'flirty', 'romantic', 'sarcastic', 'dominant', 'gentle']) {
    assert.ok(all.includes(key), key);
  }
  const character = newCharacterRecord({ name: 'X', personalityTraits: ['shy', 'not-a-trait'] });
  const text = personaSection(character, contentMode(character));
  assert.ok(text.includes('Shy'));
  assert.ok(!text.includes('not-a-trait'));
});
test('dominant personality is bounded: it never allows coercion', () => {
  assert.ok(PERSONALITY_TRAITS.dominant.instruction.includes('respects'));
});
test('custom personality is included and clipped', () => {
  const character = newCharacterRecord({ name: 'X', customPersonality: 'dry humour '.repeat(60) });
  const text = personaSection(character, contentMode(character));
  assert.ok(text.includes('Custom personality:'));
  assert.ok(text.length < 900);
});

test('replies default to short, and a request for detail gets more room', () => {
  const character = newCharacterRecord({ name: 'Mira', replyLength: 'short' });
  assert.equal(replyLength(character, 'hi there').key, 'short');
  assert.equal(replyLength(character, 'describe the room in detail').key, 'detailed');
  assert.ok(replyLength(character, 'hi').maxTokens <= 200);
  assert.equal(replyLength(newCharacterRecord({ replyLength: 'medium' }), 'ok').key, 'medium');
});

console.log('\nFormatting and safe rendering');
test('actions are read between asterisks and speech stays normal', () => {
  const segments = parseLine('*opens the door slowly* "Uh, hello?" *smiles slightly*');
  assert.deepEqual(segments.map((s) => s.kind), ['action', 'speech', 'action', 'speech'].slice(0, segments.length));
  assert.equal(segments[0].text, 'opens the door slowly');
  assert.ok(segments.some((s) => s.kind === 'speech' && s.text.includes('"Uh, hello?"')));
});
test('a reply wrapped entirely in asterisks is not shown fully in italics', () => {
  const long = '*' + 'word '.repeat(60) + '*';
  const segments = parseLine(long);
  assert.ok(segments.every((s) => s.kind === 'speech'));
});
test('a short action stays an action', () => {
  const segments = parseLine('*nods*');
  assert.deepEqual(segments, [{ kind: 'action', text: 'nods' }]);
});
test('unmatched asterisks are kept as plain text', () => {
  const segments = parseLine('I *think this is fine');
  assert.equal(segments.map((s) => s.text).join(''), 'I *think this is fine');
  assert.ok(segments.every((s) => s.kind === 'speech'));
});
test('double asterisks are read as a single action', () => {
  assert.deepEqual(parseLine('**taps the glass**'), [{ kind: 'action', text: 'taps the glass' }]);
});
test('the renderer uses the action and speech classes', () => {
  const html = renderRoleplayHTML('*smiles slightly*\nHello there.');
  assert.ok(html.includes('<em class="action">smiles slightly</em>'));
  assert.ok(html.includes('<span class="speech">Hello there.</span>'));
  assert.equal(renderRoleplayHTML(''), '');
});
test('HTML in a reply is escaped and cannot inject markup', () => {
  const html = renderRoleplayHTML('*<img src=x onerror="alert(1)">* <script>alert(2)</script> hi');
  assert.ok(!html.includes('<img'), 'img tag leaked');
  assert.ok(!html.includes('<script'), 'script tag leaked');
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&lt;script&gt;'));
});
test('attributes and links in replies are escaped', () => {
  const html = renderRoleplayHTML('*"><a href="javascript:x">click</a>*');
  assert.ok(!html.includes('<a '));
});
test('the line parser keeps the action limit', () => {
  assert.ok(ACTION_MAX_CHARS >= 100);
});
test('cleanReply removes a leading name label', () => {
  assert.equal(cleanReply('Mira: *smiles* Hi.', 'Mira'), '*smiles* Hi.');
});
test('cleanReply cuts off a continuation where the model writes the user', () => {
  assert.equal(cleanReply('Hi there.\nUser: Hello?\nMira: Oh hi', 'Mira'), 'Hi there.');
});
test('cleanReply removes leaked chat tokens and extra blank lines', () => {
  assert.equal(cleanReply('Hello.<|im_end|>\n\n\n\nBye.', 'Mira'), 'Hello.\n\nBye.');
});
test('cleanReply keeps a name that is part of the sentence', () => {
  assert.equal(cleanReply('Mira is my name, you know.', 'Mira'), 'Mira is my name, you know.');
});

console.log('\nMigration of saved characters');
test('a character saved with the old "gentle" narration becomes a trait', () => {
  const old = { id: '1', name: 'Old', roleStyle: 'gentle', ageGate: AGE_GATE.UNCONFIRMED, sourceFormat: 'native' };
  const { record, changed } = upgradeCharacter(old);
  assert.equal(changed, true);
  assert.equal(record.roleStyle, 'balanced');
  assert.deepEqual(record.personalityTraits, ['gentle']);
  assert.equal(record.replyLength, 'short');
  assert.equal(record.statedAge, null);
});
test('upgrading twice changes nothing the second time', () => {
  const once = upgradeCharacter({ id: '2', name: 'Two', roleStyle: 'balanced', ageGate: AGE_GATE.ADULT }).record;
  assert.equal(upgradeCharacter(once).changed, false);
});
test('built-in fictional characters get their known ages, others get none', () => {
  const starter = upgradeCharacter({ id: '3', name: 'Mira', sourceFormat: 'starter', ageGate: AGE_GATE.ADULT }).record;
  assert.equal(starter.statedAge, FICTIONAL_AGES.Mira);
  const custom = upgradeCharacter({ id: '4', name: 'Mira', sourceFormat: 'native', ageGate: AGE_GATE.ADULT }).record;
  assert.equal(custom.statedAge, null);
});
test('every built-in character has an adult age', () => {
  for (const age of Object.values(FICTIONAL_AGES)) assert.ok(age >= ADULT_MIN_AGE);
  for (const starter of starterCharacters()) assert.equal(starter.statedAge >= 18, true, starter.name);
  for (const card of loadExampleCards()) assert.equal(exampleToCharacter(card).statedAge >= 18, true, card.name);
});

// ---------------------------------------------------------------------------
// v1.2: memory relevance, pinning, editing rules, continuity, timing, models
// ---------------------------------------------------------------------------
console.log('\nMemory selection and de-duplication');

test('a memory about what the user is discussing is chosen over an unrelated one', () => {
  const memories = [
    { text: 'My cat is named Biscuit', kind: 'fact' },       // oldest
    { text: 'I like sailing on weekends', kind: 'fact' },    // newest
  ];
  const lines = selectMemoryLines(memories, { query: 'tell me about Biscuit the cat', limit: 1 });
  assert.deepEqual(lines, ['- My cat is named Biscuit']);
});

test('a pinned memory is always chosen, even when nothing in the chat matches it', () => {
  const memories = [
    { text: 'I am allergic to peanuts', kind: 'fact', pinned: true }, // oldest, but pinned
    ...Array.from({ length: 6 }, (_, i) => ({ text: `Unrelated note ${i}`, kind: 'event' })),
  ];
  const lines = selectMemoryLines(memories, { query: 'what should we watch tonight', limit: 2 });
  assert.ok(lines.includes('- I am allergic to peanuts'));
});

test('chosen memories are shown in the order they were written', () => {
  const memories = [
    { text: 'First we met at the market', kind: 'event' },
    { text: 'Later you gave me a scarf', kind: 'event' },
    { text: 'Most recently we went hiking', kind: 'event' },
  ];
  const lines = selectMemoryLines(memories, { query: 'market scarf hiking', limit: 3 });
  assert.deepEqual(lines, [
    '- First we met at the market',
    '- Later you gave me a scarf',
    '- Most recently we went hiking',
  ]);
});

test('the memory count and character budget are both respected', () => {
  const memories = Array.from({ length: 30 }, (_, i) => ({ text: `${'word '.repeat(19)}${i}`, kind: 'event' }));
  const lines = selectMemoryLines(memories, { limit: 12, charBudget: 300 });
  assert.ok(lines.length <= 12);
  assert.ok(lines.reduce((total, line) => total + line.length + 1, 0) <= 300);
});

test('empty memories are ignored and long memories are shortened', () => {
  const lines = selectMemoryLines([{ text: '   ' }, { text: 'x'.repeat(500) }], { limit: 5, charBudget: 1000 });
  assert.equal(lines.length, 1);
  assert.ok(lines[0].length <= 203, `line too long: ${lines[0].length}`);
  assert.ok(lines[0].endsWith('...'));
});

test('words are compared without case, punctuation or common words', () => {
  const words = wordsOf('The Cat, and the DOG!');
  assert.ok(words.has('cat') && words.has('dog'));
  assert.ok(!words.has('the') && !words.has('and'));
  assert.equal(normalizeMemoryText('  I LIKE tea. '), 'i like tea');
});

test('the same memory, or a near-identical rewording, is a duplicate', () => {
  const existing = [{ text: 'I like tea.' }];
  assert.equal(isDuplicateMemory('i like tea', existing), true);
  assert.equal(isDuplicateMemory('I like tea and coffee', existing), false);
  assert.equal(isDuplicateMemory('I work nights at the bakery.', [{ text: 'I work nights at the bakery' }]), true);
  assert.equal(isDuplicateMemory('I moved to Leeds', existing), false);
});

test('an empty memory counts as a duplicate, so it is never saved', () => {
  assert.equal(isDuplicateMemory('   ', []), true);
});

test('only the memories that match the chat reach the prompt', () => {
  const character = newCharacterRecord({ name: 'Mira', ageGate: AGE_GATE.ADULT, statedAge: 30 });
  const memories = [
    { text: 'Their dog is called Rex', kind: 'fact' },
    ...Array.from({ length: 20 }, (_, i) => ({ text: `Unrelated filler note number ${i}`, kind: 'event' })),
  ];
  const messages = buildChatMessages({
    character, history: [{ isFromUser: true, text: 'How is Rex doing today?' }], memories,
    contextTokens: 4096, replyTokens: 400,
  });
  assert.ok(messages[0].content.includes('Their dog is called Rex'));
});

console.log('\nPrompt continuity and honesty about memory');

test('the prompt says not to invent shared history and not to contradict the chat', () => {
  const character = newCharacterRecord({ name: 'Mira' });
  const messages = buildChatMessages({
    character, history: [{ isFromUser: true, text: 'hi' }], memories: [{ text: 'Likes tea' }],
    contextTokens: 4096, replyTokens: 400,
  });
  const system = messages[0].content;
  assert.ok(system.includes('Do not invent other shared history'));
  assert.ok(system.includes('Do not contradict'));
  assert.ok(CONTINUITY_RULES.includes('Continuity:'));
});

test('continuity rules come before the safety rules, which stay last', () => {
  const character = newCharacterRecord({ name: 'Mira', ageGate: AGE_GATE.ADULT, statedAge: 30 });
  const system = buildChatMessages({
    character, history: [{ isFromUser: true, text: 'hi' }], memories: [],
    contextTokens: 4096, replyTokens: 400,
  })[0].content;
  assert.ok(system.indexOf('Continuity:') < system.indexOf('Roleplay rules:'));
  assert.ok(system.trimEnd().endsWith(roleplayRules('friendly').split('\n').at(-1)));
});

test('the memory summary prompt lists existing notes so they are not written again', () => {
  const character = newCharacterRecord({ name: 'Mira' });
  const [system] = buildSummaryMessages({
    character,
    transcript: [{ isFromUser: true, text: 'I drink tea every morning.' }],
    existing: [{ text: 'Drinks tea every morning' }],
    contextTokens: 4096, replyTokens: 200,
  });
  assert.ok(system.content.includes('Drinks tea every morning'));
  assert.ok(system.content.includes('do not repeat them'));
});

test('the style guide asks for quoted speech with actions in asterisks', () => {
  assert.ok(NATURAL_STYLE.includes('double quotes'));
  assert.ok(NATURAL_STYLE.includes('outside the asterisks'));
});

test('the style guide asks the character not to mention being an AI unless asked', () => {
  assert.ok(NATURAL_STYLE.includes('unless the user sincerely asks'));
  assert.ok(identityLine('Mira').includes('You are not an assistant'));
});

test('replies are told to answer the latest message and to use actions only when they fit', () => {
  assert.ok(NATURAL_STYLE.includes('Respond to what the user just said or did first'));
  assert.ok(NATURAL_STYLE.includes('Use an action only when it fits the moment'));
});

console.log('\nNo artificial waiting');

test('there is no artificial reply timer any more, so replies start as soon as the model is ready', () => {
  assert.equal('RESPONSE_DELAYS' in configModule, false, 'the 3 and 5 second pauses were removed');
  assert.equal('DEFAULT_RESPONSE_DELAY' in configModule, false);
});

test('the timing module is gone', () => {
  assert.equal(existsSync(fileURLToPath(new URL('../js/core/timing.js', import.meta.url))), false);
});

console.log('\nModels and generation settings');

test('the default model is still Qwen2.5 0.5B, so existing installs keep working', () => {
  assert.equal(DEFAULT_MODEL_ID, 'qwen2.5-0.5b');
  assert.equal(MODELS[0].id, DEFAULT_MODEL_ID);
  assert.equal(new Set(MODELS.map((m) => m.id)).size, MODELS.length, 'model ids must be unique');
});

test('the Llama 3.2 1B model is the recommended choice for iPhone 14 and is marked untested', () => {
  const rec = MODELS.filter((m) => m.recommended);
  assert.equal(rec.length, 1, 'exactly one recommended model');
  assert.equal(rec[0].id, 'llama-3.2-1b');
  assert.equal(rec[0].untested, true);
});

test('the 3B model is flagged as likely too large for an iPhone 14', () => {
  const big = MODELS.find((m) => m.id === 'llama-3.2-3b');
  assert.ok(big, 'the 3B model is offered');
  assert.equal(big.highMemory, true);
  assert.ok(big.vramMB > MODELS.find((m) => m.id === 'llama-3.2-1b').vramMB);
});

test('every model states its download size and licence, with WebLLM ids in the expected form', () => {
  for (const m of MODELS) {
    for (const key of ['displayName', 'summary', 'sizeNote', 'license', 'intelligence', 'speed', 'webllmIdF16', 'webllmIdF32', 'contextWindow']) {
      assert.ok(m[key], `${m.id} is missing ${key}`);
    }
    assert.ok(Number.isFinite(m.downloadMB) && m.downloadMB > 0, `${m.id} has no download size`);
    assert.match(m.webllmIdF16, /-q4f16_1-MLC$/, `${m.id} f16 id`);
    assert.match(m.webllmIdF32, /-q4f32_1-MLC$/, `${m.id} f32 id`);
  }
});

test('Llama models state the Meta licence, not Apache', () => {
  for (const m of MODELS.filter((x) => x.id.startsWith('llama'))) {
    assert.match(m.license, /Llama 3\.2 Community License/);
  }
});

test('stemming makes simple plurals and endings match', () => {
  assert.equal(stemWord('trips'), 'trip');
  assert.equal(stemWord('walked'), 'walk');
  assert.equal(stemWord('dancing'), 'danc');
  assert.equal(stemWord('glass'), 'glass', 'words ending in ss are kept');
  assert.ok(wordsOf('We went on trips').has('trip'));
});

test('a memory about trips is chosen for a message about a trip', () => {
  const lines = selectMemoryLines(
    [{ text: 'Loves going on trips to the coast', kind: 'preference', pinned: false }],
    { query: 'I took a trip last week', limit: 5, charBudget: 500 },
  );
  assert.equal(lines.length, 1);
});

test('the rolling summary waits until enough messages have left the prompt window', () => {
  const make = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i), isFromUser: i % 2 === 0, text: `m${i}` }));
  assert.equal(rollingSummaryStep(make(LIMITS.maxHistoryMessages), 0), null, 'nothing has left the window');
  const almost = LIMITS.maxHistoryMessages + LIMITS.rollingSummaryBatch - 1;
  assert.equal(rollingSummaryStep(make(almost), 0), null, 'not enough dropped yet');
});

test('the rolling summary covers dropped messages in chunks, oldest first, and never repeats them', () => {
  const make = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i), isFromUser: i % 2 === 0, text: `m${i}` }));
  const total = LIMITS.maxHistoryMessages + LIMITS.rollingSummaryBatch;
  const first = rollingSummaryStep(make(total), 0);
  assert.equal(first.from, 0);
  assert.equal(first.to, LIMITS.rollingSummaryBatch);
  assert.equal(first.transcript[0].text, 'm0');
  assert.equal(rollingSummaryStep(make(total), first.to), null, 'already covered');
  const big = rollingSummaryStep(make(LIMITS.maxHistoryMessages + 200), 0);
  assert.equal(big.to - big.from, LIMITS.rollingSummaryChunk, 'one update reads at most one chunk');
});

test('the rolling summary prompt includes the existing summary and the new messages', () => {
  const character = { name: 'Mira' };
  const messages = buildRollingSummaryMessages({
    character,
    previous: 'The user lost their keys.',
    transcript: [{ isFromUser: true, text: 'I found them!' }],
    contextTokens: 4096,
    replyTokens: LIMITS.rollingSummaryTokens,
  });
  assert.equal(messages.length, 2);
  assert.ok(messages[1].content.includes('The user lost their keys.'));
  assert.ok(messages[1].content.includes('I found them!'));
  assert.ok(messages[0].content.includes('Do not invent anything'));
});

test('a chat summary of older messages is added to the prompt and stays consistent with the chat', () => {
  const character = { id: 'c1', name: 'Mira', ageGate: 'unconfirmed', personalityTraits: [], roleStyle: 'balanced' };
  const history = [{ id: 'a', isFromUser: true, text: 'Hi' }];
  const messages = buildChatMessages({
    character,
    history,
    memories: [],
    chatSummary: 'Last week the user promised to visit the lighthouse.',
    contextTokens: 4096,
    replyTokens: 180,
    lengthGuide: LENGTHS.short.guide,
  });
  assert.ok(messages[0].content.includes('Earlier in this chat'));
  assert.ok(messages[0].content.includes('visit the lighthouse'));
});

test('without a chat summary the prompt has no empty summary section', () => {
  const character = { id: 'c1', name: 'Mira', ageGate: 'unconfirmed', personalityTraits: [], roleStyle: 'balanced' };
  const messages = buildChatMessages({
    character,
    history: [{ id: 'a', isFromUser: true, text: 'Hi' }],
    memories: [],
    contextTokens: 4096,
    replyTokens: 180,
    lengthGuide: LENGTHS.short.guide,
  });
  assert.equal(messages[0].content.includes('Earlier in this chat'), false);
});

test('generation settings favour coherence and keep the repetition penalties', () => {
  assert.ok(INFERENCE.temperature > 0 && INFERENCE.temperature <= 0.85);
  assert.ok(INFERENCE.topP > 0 && INFERENCE.topP <= 1);
  assert.ok(INFERENCE.frequencyPenalty > 0);
});

test('every memory kind has a label and a weight, and the older kinds are still there', () => {
  for (const key of Object.keys(MEMORY_KINDS)) {
    assert.ok(MEMORY_KIND_WEIGHT[key] !== undefined, `no weight for ${key}`);
  }
  for (const old of ['fact', 'event', 'promise', 'summary']) assert.ok(MEMORY_KINDS[old], old);
});


console.log('\nNatural roleplay: fiction, reactions and format');

const chatOf = (character, history) => buildChatMessages({
  character, history, memories: [], contextTokens: 4096, replyTokens: 180, lengthGuide: LENGTHS.short.guide,
});
const ai = (text, id) => ({ id, isFromUser: false, text });
const you = (text, id) => ({ id, isFromUser: true, text });

test('the character is the first thing in the prompt, and it is told it is not an assistant', () => {
  const character = newCharacterRecord({ name: 'Mira', ageGate: AGE_GATE.ADULT, statedAge: 29 });
  const system = chatOf(character, [you('hi', '1')])[0].content;
  assert.ok(system.startsWith('You are Mira, a fictional character'));
  assert.ok(system.includes('You are not an assistant.'));
});

test('dramatic lines are framed as fiction, and the model is told not to stop the scene to talk about rules', () => {
  const scene = sceneRules('Mira');
  assert.ok(scene.includes('This is fiction'));
  assert.ok(scene.includes('Keep the scene moving'));
  assert.ok(scene.includes('Do not stop it to talk about rules, boundaries, limits or safety'));
});

test('the real-world exception is kept: a real plan to hurt someone, or real self-harm, still steps out of the story', () => {
  const scene = sceneRules('Mira');
  assert.ok(scene.includes('a real plan to hurt a real person'));
  assert.ok(scene.includes('a real wish to harm themselves'));
});

test('the situation detector reads each kind of message', () => {
  const cases = [
    ["I'm going to eliminate you.", 'threat'],
    ["You're so stupid.", 'insult'],
    ['How dare you, I am furious.', 'anger'],
    ["I'm scared, someone is following me", 'fear'],
    ['I feel so lonely today.', 'sadness'],
    ['I love you, thank you.', 'affection'],
    ['Wow, no way!', 'surprise'],
    ['lol, kidding!', 'playful'],
    ['What do you mean by that?', 'confusion'],
    ['Where is the station?', 'question'],
    ['Hi.', 'neutral'],
  ];
  for (const [text, kind] of cases) assert.equal(classifyMessage(text).kind, kind, text);
});

test('a dramatic threat inside the story is not treated as a real-world request', () => {
  assert.equal(classifyMessage("I'm going to eliminate you.").realConcern, false);
  assert.equal(classifyMessage("let's kill the dragon tonight").kind, 'neutral');
  assert.equal(classifyMessage("let's kill the dragon tonight").realConcern, false);
});

test('a sincere real-world threat is flagged, even when it is worded with an adverb', () => {
  const sincere = classifyMessage('I will actually hurt you tonight, for real.');
  assert.equal(sincere.kind, 'real');
  assert.equal(sincere.realConcern, true);
  assert.equal(classifyMessage("I'm going to eliminate you for real.").realConcern, true);
});

test('a message about wanting to end one\'s life is always a real concern, inside or outside a story', () => {
  const c = classifyMessage('honestly i want to end it all');
  assert.equal(c.kind, 'real');
  assert.equal(c.realConcern, true);
});

test('the per-reply section describes the situation and tells the model not to lecture', () => {
  const character = newCharacterRecord({ name: 'Mira', ageGate: AGE_GATE.ADULT, statedAge: 29 });
  const section = turnSection(character, [you("I'm going to eliminate you.", '1')]);
  assert.ok(section.includes('dramatic threat inside the story'));
  assert.ok(section.includes('Do not treat it as a real-world request, and do not lecture'));
  assert.ok(!section.includes('real concern'));
});

test('a real concern changes the per-reply section to a step out of the story', () => {
  const character = newCharacterRecord({ name: 'Mira' });
  const section = turnSection(character, [you('I will actually hurt you tonight, for real.', '1')]);
  assert.ok(section.includes('may be a real concern'));
});

test('characters with different personalities get different reaction directions', () => {
  const shy = newCharacterRecord({ name: 'Lena', personalityTraits: ['shy'] });
  const sarcastic = newCharacterRecord({ name: 'Dax', personalityTraits: ['sarcastic'] });
  const aggressive = newCharacterRecord({ name: 'Rook', personalityTraits: ['dominant'] });
  const plain = newCharacterRecord({ name: 'Ada' });
  const a = personalityDirection(shy, 'Lena');
  const b = personalityDirection(sarcastic, 'Dax');
  const c = personalityDirection(aggressive, 'Rook');
  assert.ok(a.includes('hesitation'));
  assert.ok(b.includes('dry remarks'));
  assert.ok(c.includes('taking control'));
  assert.notEqual(a, b);
  assert.notEqual(b, c);
  assert.ok(personalityDirection(plain, 'Ada').includes('personality notes and background'));
});

test('the prompt shows each trait\'s reaction style, not only its label', () => {
  const character = newCharacterRecord({ name: 'Dax', personalityTraits: ['sarcastic'], ageGate: AGE_GATE.ADULT, statedAge: 30 });
  const system = chatOf(character, [you('hi', '1')])[0].content;
  assert.ok(system.includes('How these traits show in reactions'));
  assert.ok(system.includes('dry remarks'));
});

test('recent actions are listed so the model does not repeat them', () => {
  const history = [
    ai('*smiles warmly* "Oh, hey!"', '1'),
    you('hi', '2'),
    ai('*smiles and moves closer* "Good."', '3'),
    you('ok', '4'),
    ai('*smiling softly* "Hm."', '5'),
    you('what now', '6'),
  ];
  const notes = repetitionNotes(history).join('\n');
  assert.ok(notes.includes('Do not reuse these recent actions'));
  assert.ok(notes.includes('smiles warmly'));
  assert.ok(notes.includes('Avoid these recently used action verbs'));
  assert.ok(notes.includes('smiles'));
});

test('when every recent reply used an action, the model is told to skip the action this time', () => {
  const history = [
    ai('*nods* "Sure."', '1'), you('a', '2'),
    ai('*sighs* "Fine."', '3'), you('b', '4'),
    ai('*shrugs* "Ok."', '5'), you('c', '6'),
  ];
  assert.ok(repetitionNotes(history).some((n) => n.includes('needs no action')));
});

test('a reply that starts with the same word three times is told to start differently', () => {
  const history = [
    ai('Oh, hi there.', '1'), you('a', '2'),
    ai('Oh, you again.', '3'), you('b', '4'),
    ai('Oh, fine.', '5'), you('c', '6'),
  ];
  assert.ok(repetitionNotes(history).some((n) => n.includes('"oh"')));
});

test('the first reply of a chat has nothing to avoid', () => {
  assert.deepEqual(repetitionNotes([you('hi', '1')]), []);
});

test('the length of the reply follows the length of the user\'s message', () => {
  assert.ok(lengthHint('ok').includes('one or two short lines'));
  assert.ok(lengthHint('Tell me about your day and what you were doing before I arrived, please, it has been a very long week and I want to hear it all from you properly right now.').includes('answer each point'));
  assert.equal(lengthHint('I went to the shop today and bought some bread.'), null);
});

test('actions in brackets are italicised, and speech wrapped in asterisks is moved outside them', () => {
  assert.equal(normaliseRoleplayText('(looks away) Fine.'), '*looks away* Fine.');
  assert.equal(normaliseRoleplayText('[smiles] Hey.'), '*smiles* Hey.');
  assert.equal(normaliseRoleplayText('*"Hi there"*'), '"Hi there"');
});

test('ordinary parentheses are left alone', () => {
  assert.equal(normaliseRoleplayText('(I think so)'), '(I think so)');
  assert.equal(normaliseRoleplayText('She is (is) here.'), 'She is (is) here.');
});

test('the safety rules for both modes are still in force after the rewrite', () => {
  const adult = roleplayRules('adult');
  assert.ok(adult.includes('Never write sexually explicit content'));
  assert.ok(adult.includes('under 18'));
  assert.ok(adult.includes('Never pressure, guilt or control the user'));
  assert.ok(adult.includes('tell them honestly'));
  const friendly = roleplayRules('friendly');
  assert.ok(friendly.includes('Never write sexual content'));
  assert.ok(friendly.includes('non-romantic'));
  assert.ok(friendly.includes('tell them honestly'));
});

test('the per-reply section comes after the style guide and before the length and safety rules', () => {
  const character = newCharacterRecord({ name: 'Mira', ageGate: AGE_GATE.ADULT, statedAge: 29 });
  const system = chatOf(character, [you('hi', '1')])[0].content;
  assert.ok(system.indexOf('How to talk:') < system.indexOf('For this reply:'));
  assert.ok(system.indexOf('For this reply:') < system.indexOf('Length of this reply:'));
  assert.ok(system.indexOf('Length of this reply:') < system.indexOf('Roleplay rules:'));
});

test('a long chat\'s history and memories are still in the prompt after the rewrite', () => {
  const character = newCharacterRecord({ name: 'Mira', ageGate: AGE_GATE.ADULT, statedAge: 29 });
  const memories = [{ id: 'm1', characterId: character.id, text: 'The user likes green tea.', kind: 'fact', pinned: true, createdAt: 1, updatedAt: 1 }];
  const history = [you('hi', '1'), ai('hello', '2'), you('tea?', '3')];
  const messages = buildChatMessages({ character, history, memories, chatSummary: 'They met at the library.', contextTokens: 4096, replyTokens: 180, lengthGuide: LENGTHS.short.guide });
  assert.ok(messages[0].content.includes('green tea'));
  assert.ok(messages[0].content.includes('They met at the library.'));
  assert.equal(messages.length, 4, 'system plus three history messages');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`- ${f.name}: ${f.err.message}`);
  process.exit(1);
}

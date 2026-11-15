// Tests for the pure logic: safety rules, prompt limits, card import, examples.
// Run with:  node tests/run-tests.mjs   (or: npm test)
import assert from 'node:assert/strict';
import { suggestsMinor, AGE_GATE, roleplayRules } from '../js/core/safety.js';
import { clip, buildChatMessages, buildSummaryMessages } from '../js/core/prompt.js';
import {
  parsePasted, parseObject, parseCardFile, cardToCharacter, replaceMacros, taglineOf,
  isPNG,
} from '../js/core/cards.js';
import { loadExampleCards, exampleToCharacter } from '../js/core/examples.js';
import { starterCharacters } from '../js/core/starters.js';
import { newCharacterRecord } from '../js/core/characters.js';
import { timeAgo, initialsOf, hueFromString } from '../js/core/util.js';

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
test('unconfirmed characters get non-romantic rules', () => {
  assert.ok(roleplayRules(AGE_GATE.UNCONFIRMED).includes('non-romantic'));
  assert.ok(roleplayRules(AGE_GATE.ADULT).includes('Roleplay rules:'));
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
test('the roleplay style is included', () => {
  const character = newCharacterRecord({ name: 'Mira', roleStyle: 'gentle', ageGate: AGE_GATE.ADULT });
  const messages = buildChatMessages({
    character, history: [{ isFromUser: true, text: 'hi' }], memories: [],
    contextTokens: 4096, replyTokens: 400,
  });
  assert.ok(messages[0].content.includes('Be calm, warm and patient'));
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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`- ${f.name}: ${f.err.message}`);
  process.exit(1);
}

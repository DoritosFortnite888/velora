// Turns model replies into safe, readable HTML. Pure functions, tested in Node.
//
// Roleplay convention: *actions and expressions* are wrapped in asterisks. They are shown in a
// smaller italic font. Spoken dialogue is plain text. Every piece of text is escaped first, so a
// reply can never inject HTML or scripts.
import { escapeHTML } from './util.js';

// An asterisk span longer than this is treated as speech, not an action. This stops a whole
// reply written inside asterisks from being shown entirely in italics.
export const ACTION_MAX_CHARS = 160;

// Splits one line into segments: { kind: 'speech' | 'action', text }.
export function parseLine(line) {
  const segments = [];
  const push = (kind, text) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last && last.kind === kind) last.text += text;
    else segments.push({ kind, text });
  };

  const source = line.replace(/\*{2,}/g, '*'); // **bold** is read as *action*
  const pattern = /\*([^*\n]+)\*/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(source))) {
    push('speech', source.slice(cursor, match.index));
    const inner = match[1].trim();
    if (!inner) {
      push('speech', match[0]);
    } else if (inner.length > ACTION_MAX_CHARS) {
      push('speech', match[1]); // too long to be an action: show as normal text
    } else {
      push('action', inner);
    }
    cursor = pattern.lastIndex;
  }
  push('speech', source.slice(cursor));
  return segments;
}

// Splits a whole reply into lines, each with its segments. Blank lines are skipped.
export function parseRoleplay(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => line.trim())
    .map(parseLine)
    .filter((segments) => segments.length > 0);
}

// Safe HTML for a reply. Every piece of text is escaped, and only <p>, <span> and <em> are added.
export function renderRoleplayHTML(text) {
  return parseRoleplay(text)
    .map((segments) => {
      const parts = segments.map((segment) => (
        segment.kind === 'action'
          ? `<em class="action">${escapeHTML(segment.text)}</em>`
          : `<span class="speech">${escapeHTML(segment.text)}</span>`
      ));
      return `<p>${parts.join('')}</p>`;
    })
    .join('');
}

// True when a reply has spoken words: text outside asterisks that has at least one letter or digit.
// A reply made only of actions, such as "*smiles*", has no speech and returns false.
export function hasSpeech(text) {
  return parseRoleplay(text).some((line) => line.some((s) => s.kind === 'speech' && /[\p{L}\p{N}]/u.test(s.text)));
}

// Fixes common formatting slips in a model reply, so the roleplay format holds:
//  - dialogue wrapped in asterisks (*"Hi"*) is moved outside them,
//  - an action written in parentheses or square brackets, such as (laughs softly), becomes *laughs softly*.
// Only short, plain action phrases are changed, so ordinary parenthesised words are left alone.
export function normaliseRoleplayText(text) {
  let out = String(text ?? '');
  out = out.replace(/\*\s*"([^"\n*]{1,400})"\s*\*/g, '"$1"');
  const asAction = (match, inner) => {
    const phrase = inner.trim();
    const words = phrase.split(/\s+/);
    const first = words[0].toLowerCase();
    // A third-person or past-tense verb: looks, nods, sighs, smiled, tilted. Short words are skipped.
    if (words.length > 12 || first.length < 4 || !/(s|ed|ing)$/.test(first)) return match;
    return `*${phrase}*`;
  };
  out = out.replace(/\(([a-z][a-z' ,-]{1,80})\)/g, asAction);
  out = out.replace(/\[([a-z][a-z' ,-]{1,80})\]/g, asAction);
  return out;
}

// Tidies a model reply before it is saved:
//  - removes special chat tokens that leaked into the text,
//  - cuts off anything after the model starts writing the user's lines,
//  - removes a leading label such as "Mira:" that the model sometimes adds.
export function cleanReply(text, characterName = '') {
  let out = String(text ?? '').replace(/\r\n?/g, '\n');
  out = out.replace(/<\|[^|>\n]{1,40}\|>/g, '');
  out = normaliseRoleplayText(out);
  out = out.split(/\n\s*\[?user\]?\s*:/i)[0];
  if (characterName) {
    const escaped = characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`^\\s*${escaped}\\s*:\\s*`, 'i'), '');
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

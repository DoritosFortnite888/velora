// Memory selection for the character prompt, and duplicate checks for new memories.
// Pure logic, tested in Node. Nothing here calls a model.
//
// Every memory is kept on the device. For each reply, Velora picks the few that fit what the user
// is talking about now, plus any the user has pinned, so the prompt stays short and relevant.
import { LIMITS, MEMORY_KIND_WEIGHT } from './config.js';

export const MEMORY_MAX_CHARS = 200;

const PINNED_POINTS = 100;   // pinned memories are always chosen first
const OVERLAP_POINTS = 2;    // each word shared with the recent chat
const RECENCY_POINTS = 1;    // newer memories score a little higher than older ones

// Common words that say nothing about what a memory is about.
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'are', 'was', 'were', 'have', 'has',
  'had', 'not', 'but', 'what', 'when', 'where', 'who', 'how', 'why', 'about', 'from', 'they', 'them',
  'their', 'there', 'here', 'just', 'like', 'really', 'will', 'would', 'could', 'should', 'can', 'did',
  'does', 'into', 'over', 'then', 'than', 'too', 'very', 'also', 'its', 'his', 'her', 'she', 'him',
  'our', 'out', 'all', 'any', 'one', 'get', 'got', 'let', 'yes', 'yeah', 'okay', 'know',
]);

// A very small stemmer: removes plural and past/present endings, so "trips" matches "trip" and
// "walked" matches "walk". It is deliberately simple. It only needs to make matching a little fairer.
export function stemWord(word) {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

// The meaningful words in a piece of text, lower case, with common words removed.
export function wordsOf(text) {
  const found = String(text ?? '').toLowerCase().match(/\p{L}[\p{L}\p{N}']*/gu) ?? [];
  const words = new Set();
  for (const raw of found) {
    const word = raw.replace(/'s$/, '');
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    words.add(stemWord(word));
  }
  return words;
}

// Lower-case text with punctuation and extra spaces removed. Used to compare two memories.
export function normalizeMemoryText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// True when a new memory says the same thing as one already saved, or is empty.
export function isDuplicateMemory(text, existing = []) {
  const next = normalizeMemoryText(text);
  if (!next) return true;
  return existing.some((memory) => {
    const old = normalizeMemoryText(memory.text);
    if (!old) return false;
    if (old === next) return true;
    // One contains the other and they are nearly the same length: a rewording of the same point.
    const shorter = Math.min(old.length, next.length);
    const longer = Math.max(old.length, next.length);
    return (old.includes(next) || next.includes(old)) && shorter / longer >= 0.8;
  });
}

function clipLine(text, limit) {
  return text.length <= limit ? text : text.slice(0, limit - 3).trimEnd() + '...';
}

// Chooses memories for one reply and returns them as prompt lines ("- ..."), in the order they were written.
//   memories: oldest first, as the database returns them.
//   query:    the recent chat text, so memories about what is being discussed rank higher.
export function selectMemoryLines(memories, {
  query = '',
  limit = LIMITS.maxMemories,
  charBudget = LIMITS.memoryChars,
} = {}) {
  const list = (memories ?? []).filter((m) => normalizeMemoryText(m?.text));
  if (list.length === 0) return [];

  const queryWords = wordsOf(query);
  const newest = Math.max(1, list.length - 1);

  const scored = list.map((memory, index) => {
    let overlap = 0;
    for (const word of wordsOf(memory.text)) {
      if (queryWords.has(word)) overlap++;
    }
    const recency = index / newest; // 0 for the oldest memory, 1 for the newest
    const score =
      (memory.pinned ? PINNED_POINTS : 0) +
      overlap * OVERLAP_POINTS +
      (MEMORY_KIND_WEIGHT[memory.kind] ?? 1) +
      recency * RECENCY_POINTS;
    return { memory, index, score };
  });

  // Highest score first. On a tie, the newer memory wins.
  scored.sort((a, b) => b.score - a.score || b.index - a.index);

  const picked = [];
  let used = 0;
  for (const { memory, index } of scored) {
    if (picked.length >= limit) break;
    const line = '- ' + clipLine(memory.text.trim(), MEMORY_MAX_CHARS);
    if (used + line.length > charBudget) continue; // skip a long one, keep looking for shorter ones
    used += line.length + 1;
    picked.push({ index, line });
  }

  return picked.sort((a, b) => a.index - b.index).map((p) => p.line);
}

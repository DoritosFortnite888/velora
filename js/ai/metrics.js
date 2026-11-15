// Timing for real replies and for the on-device speed test. Kept in memory only: nothing is saved,
// so there is no new data to back up or erase.
//
// A "chunk" is one streamed piece from the model. WebLLM sends about one token per chunk, but that is
// not guaranteed, so tokens per second is an estimate. Time to first token is measured from the start
// of generation (after the model is ready) to the first streamed piece. It includes reading the prompt.
import { hasSpeech } from '../core/format.js';

const KEEP = 20;
const replies = [];
let lastSpeedTest = null;

// Starts timing one generation. Call right before the model starts to write.
export function startReply(now = performance.now()) {
  return { sentAt: now, firstAt: null, chunks: 0 };
}

// Called once for every streamed piece.
export function markChunk(timer, now = performance.now()) {
  timer.chunks++;
  if (timer.firstAt === null) timer.firstAt = now;
}

// Turns a finished timer into a record. Only successful replies are kept in the list.
export function finishReply(timer, { text = '', now = performance.now(), keep = true, loadMs = null } = {}) {
  const timeToFirstTokenMs = timer.firstAt === null ? null : timer.firstAt - timer.sentAt;
  // Speed is measured after the first chunk, so reading the prompt does not count as writing speed.
  const writeMs = timer.firstAt === null ? 0 : now - timer.firstAt;
  const tokensPerSecond = timer.chunks > 1 && writeMs > 0 ? (timer.chunks - 1) / (writeMs / 1000) : null;
  const record = {
    timeToFirstTokenMs: round(timeToFirstTokenMs),
    tokensPerSecond: round1(tokensPerSecond),
    chunks: timer.chunks,
    loadMs: loadMs === null ? null : round(loadMs),
    actionOnly: !hasSpeech(text),
    at: Date.now(),
  };
  if (keep) {
    replies.push(record);
    if (replies.length > KEEP) replies.shift();
  }
  return record;
}

export function recordSpeedTest(result) {
  lastSpeedTest = { ...result, at: Date.now() };
}

export const getSpeedTest = () => lastSpeedTest;
export const recentReplies = () => replies.slice();

// Medians and counts across a list of replies. Null when there is nothing to summarise.
export function summarize(list = replies) {
  if (list.length === 0) return null;
  return {
    count: list.length,
    medianTimeToFirstTokenMs: median(list.map((r) => r.timeToFirstTokenMs)),
    medianTokensPerSecond: median(list.map((r) => r.tokensPerSecond)),
    actionOnly: list.filter((r) => r.actionOnly).length,
  };
}

export function resetMetrics() {
  replies.length = 0;
  lastSpeedTest = null;
}

function median(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}
const round = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null);
const round1 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

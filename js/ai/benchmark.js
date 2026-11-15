// On-device speed test. It writes a fixed short reply with the selected model, so speed can be compared
// between phones and models. It never runs while a chat reply is being written, and it is not saved
// as a chat. It needs the model to be downloaded, and it does not download anything.
import { modelBlockReason } from '../core/model-policy.js';
import { getDeviceReport } from './device.js';
import { generate, EngineError } from './engine.js';
import { selectedSpec, isDownloaded, modelFilesReady, ensureLoaded } from './model-store.js';
import { isGenerating, waitForBackgroundWork } from './chat.js';
import { startReply, markChunk, finishReply, recordSpeedTest } from './metrics.js';

export const SPEED_TEST_MAX_TOKENS = 64;

const TEST_MESSAGES = [
  { role: 'system', content: 'You are a friendly narrator. Reply in two short sentences.' },
  { role: 'user', content: 'Describe a quiet morning by the sea.' },
];

export async function runSpeedTest({ onStatus } = {}) {
  if (isGenerating()) throw new EngineError('A reply is being written. Wait for it to finish, then run the speed test.');

  const report = await getDeviceReport();
  if (!report.ok) throw new EngineError(`This device cannot run the AI model. ${report.problems.join(' ')}`);

  const spec = await selectedSpec();
  const block = modelBlockReason(spec, report);
  if (block) throw new EngineError(block);
  if (!(await isDownloaded(spec))) {
    throw new EngineError(`${spec.displayName} is not downloaded yet. Download it on the AI models page first.`);
  }
  if (!(await modelFilesReady(spec, report.hasF16))) {
    throw new EngineError(`The files for ${spec.displayName} are no longer on this device. Download them again first (about ${spec.downloadMB} MB, estimate).`);
  }

  const loadStart = performance.now();
  await ensureLoaded(spec, {
    hasF16: report.hasF16,
    onProgress: (p) => onStatus?.(`Loading ${Math.round((p.progress || 0) * 100)}%`),
  });
  const loadMs = performance.now() - loadStart;

  await waitForBackgroundWork();
  onStatus?.('Writing…');
  const timer = startReply();
  let text = '';
  await generate(TEST_MESSAGES, {
    maxTokens: SPEED_TEST_MAX_TOKENS,
    temperature: 0.7,
    topP: 0.9,
    onToken: (piece) => {
      text += piece;
      markChunk(timer);
    },
  });

  const result = finishReply(timer, { text, keep: false, loadMs });
  const full = { ...result, model: spec.displayName, hasF16: report.hasF16, deviceReported: report.adapterName || 'unknown GPU' };
  recordSpeedTest(full);
  return full;
}

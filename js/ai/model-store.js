// Model selection, download state and deletion. Remembers in IndexedDB which models are downloaded.
import * as db from '../data/db.js';
import { MODELS, DEFAULT_MODEL_ID } from '../core/config.js';
import { loadEngine, unloadEngine, deleteModelFiles, resolveModelId, EngineError } from './engine.js';
import { getDeviceReport } from './device.js';

export function specById(id) {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export async function selectedSpec() {
  const id = await db.getSetting('selectedModel');
  return specById(id ?? DEFAULT_MODEL_ID);
}

export async function downloadRecord(spec) {
  return (await db.getSetting(`model:${spec.id}`)) ?? null;
}

export async function isDownloaded(spec) {
  return !!(await downloadRecord(spec))?.downloadedAt;
}

// Downloads (or re-loads from the cache) the model. Records success so chat knows it is ready.
export async function downloadModel(spec, onProgress) {
  const report = await getDeviceReport({ force: true });
  if (!report.ok) {
    throw new EngineError(`This device cannot run the model. ${report.problems.join(' ')}`);
  }
  await loadEngine(spec, { hasF16: report.hasF16, onProgress });
  await db.setSetting(`model:${spec.id}`, {
    downloadedAt: Date.now(),
    webllmId: resolveModelId(spec, report.hasF16),
  });
}

export async function removeModel(spec) {
  const record = await downloadRecord(spec);
  await unloadEngine();
  const ids = [spec.webllmIdF16, spec.webllmIdF32];
  if (record?.webllmId && !ids.includes(record.webllmId)) ids.push(record.webllmId);
  await deleteModelFiles(ids);
  await db.setSetting(`model:${spec.id}`, null);
}

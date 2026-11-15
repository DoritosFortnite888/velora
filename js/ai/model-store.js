// Model selection, downloads, cancellation, deletion and the memory released when switching.
// Remembers in IndexedDB which models are downloaded. Nothing here downloads a model on its own:
// every download starts from a tap on the Models page, after the user has confirmed the size.
import * as db from '../data/db.js';
import { MODELS, DEFAULT_MODEL_ID } from '../core/config.js';
import {
  loadEngine,
  unloadEngine,
  deleteModelFiles,
  resolveModelId,
  currentModelId,
  modelFilesCached,
  EngineError,
} from './engine.js';
import { getDeviceReport } from './device.js';
import { modelBlockReason } from '../core/model-policy.js';

const LOAD_MARK = 'modelLoadInProgress';
export const CANCELLED_MESSAGE = 'The download was cancelled. Files that were already saved stay on this device, so the next download can reuse them.';

export class DownloadCancelled extends EngineError {}

export function specById(id) {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export async function selectedSpec() {
  const id = await db.getSetting('selectedModel');
  return specById(id ?? DEFAULT_MODEL_ID);
}

// In-memory download state. Only one download can run at a time.
let active = null;       // { specId, progress, text }
let cancelReject = null; // rejects the waiting download when the user cancels
let background = null;   // a cancelled load that is still finishing in the browser

export const downloadingSpecId = () => active?.specId ?? null;
export const downloadProgress = () => (active ? { progress: active.progress, text: active.text } : null);
export const isDownloadBusy = () => !!active || !!background;

// Chooses which model Velora uses. Choosing does not download anything. Switching frees the memory of
// the model that was loaded before. It does not delete any files.
export async function chooseModel(id) {
  const spec = MODELS.find((m) => m.id === id);
  if (!spec) throw new Error('That model is not available in this version of Velora.');
  await db.setSetting('selectedModel', spec.id);
  const loaded = currentModelId();
  if (loaded && loaded !== spec.webllmIdF16 && loaded !== spec.webllmIdF32) {
    await unloadEngine();
  }
  return spec;
}

export async function downloadRecord(spec) {
  return (await db.getSetting(`model:${spec.id}`)) ?? null;
}

export async function isDownloaded(spec) {
  return !!(await downloadRecord(spec))?.downloadedAt;
}

// Checks that the downloaded files are still in the browser cache. If the record says downloaded but
// the files are gone (Safari can clear them), this returns false. Chat then asks the user to
// download again, instead of starting a large download without asking.
export async function modelFilesReady(spec, hasF16) {
  if (!(await isDownloaded(spec))) return false;
  const cached = await modelFilesCached(resolveModelId(spec, hasF16));
  return cached !== false;
}

// A load that started but never finished. It is set before a download or load and cleared when the
// load ends. If the page was reloaded in between (for example because iOS ran out of memory), it stays set.
export async function interruptedLoad() {
  const mark = await db.getSetting(LOAD_MARK);
  if (!mark?.modelId) return null;
  return specById(mark.modelId);
}

export async function clearInterruptedLoad() {
  await db.setSetting(LOAD_MARK, null);
}

async function loadWithMark(spec, options) {
  await db.setSetting(LOAD_MARK, { modelId: spec.id, at: Date.now() });
  try {
    const engine = await loadEngine(spec, options);
    await db.setSetting(LOAD_MARK, null);
    return engine;
  } catch (err) {
    await db.setSetting(LOAD_MARK, null);
    throw err;
  }
}

// Loads the selected model for chat. Never downloads files that are no longer on the device.
export async function ensureLoaded(spec, { hasF16, onProgress } = {}) {
  const block = modelBlockReason(spec, await getDeviceReport());
  if (block) throw new EngineError(block);
  return loadWithMark(spec, { hasF16, onProgress });
}

// Downloads a model. Records success so chat knows it is ready.
export async function downloadModel(spec, onProgress) {
  if (active || background) {
    throw new EngineError('Another model is still downloading. Wait for it to finish, or cancel it first.');
  }
  const report = await getDeviceReport({ force: true });
  if (!report.ok) {
    throw new EngineError(`This device cannot run the model. ${report.problems.join(' ')}`);
  }
  // Refused before any bytes are fetched, so a model that will not run here does not use the data.
  const block = modelBlockReason(spec, report);
  if (block) throw new EngineError(block);

  active = { specId: spec.id, progress: 0, text: 'Starting…' };
  const cancelled = new Promise((_, reject) => { cancelReject = reject; });
  const load = loadWithMark(spec, {
    hasF16: report.hasF16,
    onProgress: (p) => {
      if (!active || active.specId !== spec.id) return;
      active.progress = p.progress;
      active.text = p.text;
      onProgress?.(p);
    },
  });

  try {
    await Promise.race([load, cancelled]);
    await db.setSetting(`model:${spec.id}`, {
      downloadedAt: Date.now(),
      webllmId: resolveModelId(spec, report.hasF16),
    });
  } catch (err) {
    if (err instanceof DownloadCancelled) {
      // The library cannot abort its own file requests, so the load keeps running in the background.
      // Free the model when it finishes, and block new downloads until then.
      background = load
        .then(() => unloadEngine(), () => {})
        .finally(() => { background = null; });
    }
    throw err;
  } finally {
    active = null;
    cancelReject = null;
  }
}

export function cancelDownload() {
  if (!active) return false;
  cancelReject?.(new DownloadCancelled(CANCELLED_MESSAGE));
  return true;
}

// Removes the cached files for one model and forgets its download record.
// Other models are not touched. A model that is downloading cannot be deleted until it finishes.
export async function removeModel(spec) {
  if (active?.specId === spec.id) {
    throw new EngineError('This model is still downloading. Cancel the download first.');
  }
  const record = await downloadRecord(spec);
  const loaded = currentModelId();
  if (loaded && (loaded === spec.webllmIdF16 || loaded === spec.webllmIdF32)) {
    await unloadEngine();
  }
  const ids = [spec.webllmIdF16, spec.webllmIdF32];
  if (record?.webllmId && !ids.includes(record.webllmId)) ids.push(record.webllmId);
  await deleteModelFiles(ids);
  await db.setSetting(`model:${spec.id}`, null);
}

// What the Models page needs to show for one model.
export async function modelStatus(spec) {
  const loaded = currentModelId();
  return {
    downloaded: await isDownloaded(spec),
    loaded: !!loaded && (loaded === spec.webllmIdF16 || loaded === spec.webllmIdF32),
    downloading: downloadingSpecId() === spec.id,
  };
}

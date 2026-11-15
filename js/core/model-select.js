// Chooses the smartest model this device can run. Pure logic, tested in Node.
// Only models that are already downloaded are considered, so choosing never starts a download.
import { modelBlockReason } from './model-policy.js';
import { IOS_MODEL_BUDGET_MB, DEFAULT_MODEL_MODE } from './config.js';

// Decides whether one model can be used on this device. Returns { ok, reason }.
export function eligibility(spec, { report, downloaded }) {
  if (!downloaded) return { ok: false, reason: 'not downloaded' };
  if (!report?.ok) return { ok: false, reason: 'this device does not pass the basic checks' };
  if (modelBlockReason(spec, report)) {
    return { ok: false, reason: 'too large for an iPhone Safari tab' };
  }
  if (report.isIOS) {
    if (spec.knownIssue) return { ok: false, reason: `a known load problem on iPhone: ${spec.knownIssue}` };
    const needMB = spec.vramMB ?? spec.downloadMB;
    if (needMB > IOS_MODEL_BUDGET_MB) {
      return { ok: false, reason: `needs about ${needMB} MB, above the iPhone budget of ${IOS_MODEL_BUDGET_MB} MB` };
    }
  }
  return { ok: true, reason: '' };
}

// Picks the highest-quality model that is downloaded and eligible. Ties go to the smaller model, which is
// the safer choice. Returns { spec, skipped }, where skipped lists downloaded models that were not chosen
// and why, so the Models page can explain the choice.
export function chooseSmartest(models, { report, downloadedIds }) {
  const skipped = [];
  let best = null;
  for (const spec of models) {
    const downloaded = downloadedIds.includes(spec.id);
    const verdict = eligibility(spec, { report, downloaded });
    if (!verdict.ok) {
      if (downloaded) skipped.push({ id: spec.id, reason: verdict.reason });
      continue;
    }
    const size = spec.vramMB ?? spec.downloadMB;
    const bestSize = best ? (best.vramMB ?? best.downloadMB) : Infinity;
    if (!best || spec.quality > best.quality || (spec.quality === best.quality && size < bestSize)) {
      best = spec;
    }
  }
  return { spec: best, skipped };
}

// The mode to use. A stored mode always wins. An install with no stored mode but with a model the user
// picked by hand keeps that choice ('manual'). A fresh install uses the default.
export function resolveMode(storedMode, storedSelection) {
  if (storedMode === 'auto' || storedMode === 'manual') return storedMode;
  if (storedSelection) return 'manual';
  return DEFAULT_MODEL_MODE;
}

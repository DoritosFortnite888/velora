// Checks whether this browser and device can run the on-device model, before anything is downloaded.
// Browsers do not report total RAM (Safari never does), so the checks use what WebGPU exposes.
// Every result is a heuristic. The model can still fail; the app explains the failure when it does.
import { DEVICE } from '../core/config.js';
import { formatMB } from '../core/util.js';

const MB = 1024 * 1024;
const isIOSDevice = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let cached = null;

export async function getDeviceReport({ force = false } = {}) {
  if (cached && !force) return cached;

  const report = {
    ok: false,
    problems: [],
    notes: [],
    secureContext: globalThis.isSecureContext === true,
    hasWebGPU: false,
    hasAdapter: false,
    hasF16: false,
    maxBufferMB: null,
    storageBindingMB: null,
    deviceMemoryGB: navigator.deviceMemory ?? null,
    isIOS: isIOSDevice(),
    storageQuotaMB: null,
    storageUsedMB: null,
    persisted: null,
    adapterName: '',
  };

  if (!report.secureContext) {
    report.problems.push('This page is not running over a secure connection (HTTPS). WebGPU and offline storage need HTTPS or localhost.');
  }

  if (!navigator.gpu) {
    report.problems.push(
      report.isIOS
        ? 'This Safari does not offer WebGPU. WebGPU needs iOS 26 or later, with Safari up to date. Check Settings > Apps > Safari > Advanced for a WebGPU or experimental feature setting, turn it on, then fully close and reopen Safari.'
        : 'This browser does not offer WebGPU. Use a recent version of Chrome or Edge on Windows, and make sure hardware acceleration is turned on.',
    );
  } else {
    report.hasWebGPU = true;
    let adapter = null;
    try {
      adapter = await navigator.gpu.requestAdapter();
    } catch (err) {
      report.problems.push(`The graphics adapter could not be requested (${err.message}).`);
    }

    if (!adapter) {
      if (report.problems.length === 0) {
        report.problems.push('WebGPU is present, but no graphics adapter was returned. The GPU may be blocked, out of date, or unsupported.');
      }
    } else {
      report.hasAdapter = true;
      report.adapterName = adapter.info?.description || adapter.info?.device || '';
      report.hasF16 = adapter.features?.has?.('shader-f16') === true;

      const maxBuffer = adapter.limits?.maxBufferSize ?? 0;
      const binding = adapter.limits?.maxStorageBufferBindingSize ?? 0;
      report.maxBufferMB = Math.round(maxBuffer / MB);
      report.storageBindingMB = Math.round(binding / MB);

      if (maxBuffer && maxBuffer < DEVICE.minMaxBufferMB * MB) {
        report.problems.push(`This GPU allows buffers of only ${report.maxBufferMB} MB, but the model needs at least ${DEVICE.minMaxBufferMB} MB.`);
      }
      if (binding && binding < DEVICE.minStorageBindingMB * MB) {
        report.problems.push(`This GPU allows storage bindings of only ${report.storageBindingMB} MB, but the model needs at least ${DEVICE.minStorageBindingMB} MB.`);
      }
      if (!report.hasF16) {
        report.notes.push('This GPU does not support 16-bit shaders, so the larger 32-bit model build will be used.');
      }
    }
  }

  if (report.deviceMemoryGB !== null) {
    if (report.deviceMemoryGB < DEVICE.minDeviceMemoryGB) {
      report.problems.push(`This device reports only ${report.deviceMemoryGB} GB of memory. The model needs at least ${DEVICE.minDeviceMemoryGB} GB.`);
    }
  } else {
    report.notes.push("This browser does not report RAM. Velora cannot measure your phone's memory directly, so it relies on the GPU limits above.");
  }

  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate) {
      const quota = estimate.quota ?? 0;
      const usage = estimate.usage ?? 0;
      report.storageQuotaMB = Math.round(quota / MB);
      report.storageUsedMB = Math.round(usage / MB);
      const freeMB = (quota - usage) / MB;
      if (quota && freeMB < DEVICE.storageNeededMB) {
        report.notes.push(`About ${formatMB(Math.round(freeMB))} of browser storage is free. The model needs roughly ${formatMB(DEVICE.storageNeededMB)}.`);
      }
    }
  } catch {
    // Storage estimates are optional.
  }

  try {
    report.persisted = (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    report.persisted = null;
  }

  report.ok = report.problems.length === 0;
  cached = report;
  return report;
}

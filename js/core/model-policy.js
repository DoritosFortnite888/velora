// Decides whether a model may be downloaded or loaded on this device. Pure logic, tested in Node.
// A block is a plain reason the user can read. It stops a large download before any bytes are fetched.

// Models flagged highMemory (the 3B model) are too large for an iPhone Safari tab, according to
// WebLLM's own memory figure and third-party reports. This is a judgement, not a measurement.
export function modelBlockReason(spec, report) {
  if (!spec) return 'That model is not available in this version of Velora.';
  if (report?.isIOS && spec.highMemory) {
    return `${spec.displayName} is too large for an iPhone Safari tab, so Velora does not download it on iPhone. Choose Llama 3.2 1B or Qwen2.5 0.5B instead. (On a desktop computer this model can still be chosen.)`;
  }
  return null;
}

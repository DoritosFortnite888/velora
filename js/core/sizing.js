// Size estimates for model weights. Pure arithmetic, tested in Node.
// weights = parameters x bits per weight / 8. This counts only the weights. Runtime buffers, the KV cache and
// the browser's own memory come on top, so every figure here is a lower bound.
const MB = 1024 * 1024;

export function weightsMB(paramsBillions, bitsPerWeight) {
  return Math.round((paramsBillions * 1e9 * bitsPerWeight) / 8 / MB);
}

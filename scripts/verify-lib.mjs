// Pure helpers for scripts/verify-model.mjs. No network and no file access here, so they are tested in Node.

// Case-insensitive search for each needle in a text. Returns one entry per needle with its count.
export function searchText(text, needles) {
  const haystack = String(text ?? '').toLowerCase();
  return needles.map((needle) => {
    const n = String(needle).toLowerCase();
    let count = 0;
    let at = haystack.indexOf(n);
    while (at !== -1) {
      count++;
      at = haystack.indexOf(n, at + n.length);
    }
    return { needle, count };
  });
}

// Summarises a Hugging Face repo's file list (the "siblings" from its API).
// Reports the total size, and whether the usual pieces of a runnable model are present.
export function summarizeHFFiles(siblings = []) {
  const names = siblings.map((f) => f.rfilename ?? '');
  const totalBytes = siblings.reduce((sum, f) => sum + (Number(f.size) || 0), 0);
  const has = (re) => names.some((n) => re.test(n));
  return {
    fileCount: siblings.length,
    totalMB: Math.round(totalBytes / (1024 * 1024)),
    hasConfig: has(/(^|\/)config\.json$/),
    hasTokenizer: has(/(^|\/)tokenizer\.(json|model)$/),
    hasWeights: has(/\.(safetensors|gguf|onnx|bin)$/),
    hasOnnx: has(/\.onnx$/),
    hasGGUF: has(/\.gguf$/),
    weightFiles: names.filter((n) => /\.(safetensors|gguf|onnx|bin)$/.test(n)).slice(0, 12),
  };
}

// Turns a list of named checks ({ name, pass, detail }) into one verdict. The verdict passes only when
// every check passes, and it lists the names of the checks that did not.
export function verdict(checks) {
  const failed = checks.filter((c) => !c.pass).map((c) => c.name);
  return { pass: failed.length === 0 && checks.length > 0, failed };
}

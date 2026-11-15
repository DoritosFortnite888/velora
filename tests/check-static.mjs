// Static checks for the browser code, which Node cannot run directly:
//  - every relative import points at a real file,
//  - every imported name is exported by that file,
//  - every ICON.<name> used in the UI exists in dom.js,
//  - every JavaScript file parses.
// Run with:  node tests/check-static.mjs   (or: npm test)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(full);
  }
  return out;
}

const files = walk(join(root, 'js')).concat(join(root, 'sw.js'));

// Names each module exports (function, const, let, class, and export { ... } lists).
function exportsOf(file) {
  const src = readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  }
  return names;
}

const importRe = /import\s+(?:(\*\s+as\s+\w+)|(\{[^}]*\})|(\w+))?\s*(?:,\s*(\{[^}]*\}))?\s*from\s+['"]([^'"]+)['"]/g;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const match of src.matchAll(importRe)) {
    const spec = match[5];
    if (!spec.startsWith('.')) continue; // external URLs are checked at runtime
    const target = resolve(dirname(file), spec);
    let stat;
    try { stat = statSync(target); } catch { problems.push(`${relative(root, file)}: missing import ${spec}`); continue; }
    if (!stat.isFile()) { problems.push(`${relative(root, file)}: import is not a file ${spec}`); continue; }

    const named = [match[2], match[4]].filter(Boolean).join(',');
    if (!named) continue;
    const available = exportsOf(target);
    for (const part of named.replace(/[{}]/g, '').split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0];
      if (name && !available.has(name)) {
        problems.push(`${relative(root, file)}: "${name}" is not exported by ${spec}`);
      }
    }
  }
}

// Icon names used in the UI must exist.
const domSrc = readFileSync(join(root, 'js/ui/dom.js'), 'utf8');
const iconKeys = new Set([...domSrc.matchAll(/^\s{2}(\w+): svg\(/gm)].map((m) => m[1]));
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/ICON\.(\w+)/g)) {
    if (!iconKeys.has(m[1])) problems.push(`${relative(root, file)}: unknown icon ICON.${m[1]}`);
  }
}

// Every file must parse as an ES module.
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    problems.push(`${relative(root, file)}: syntax error\n${err.stderr?.toString().split('\n').slice(0, 4).join('\n')}`);
  }
}

console.log(`Checked ${files.length} files.`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`- ${p}`);
  process.exit(1);
}
console.log('All imports, exports, icon names and syntax checks passed.');

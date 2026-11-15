#!/usr/bin/env node
// Verifies a candidate model before Velora offers it. Run it on a computer with internet access:
//
//   node scripts/verify-model.mjs lfm2.5-1.2b
//
// It checks three things and prints a report:
//   1. The WebLLM package pinned by Velora mentions the model family (so a WebLLM build may exist).
//   2. The Hugging Face repo exists, and has the files a runnable model needs (config, tokenizer, weights).
//   3. The licence tag is shown, so it can be read before use.
// It downloads nothing that is kept: the WebLLM package is unpacked into a temporary folder and removed.
// Exit code 0 means every check passed. Anything else means the candidate must stay out of MODELS.
import { mkdtempSync, rmSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { CANDIDATE_MODELS, WEBLLM_VERSION } from '../js/core/config.js';
import { searchText, summarizeHFFiles, verdict } from './verify-lib.mjs';

const id = process.argv[2];
const candidate = CANDIDATE_MODELS.find((m) => m.id === id);
if (!candidate) {
  console.error(`Unknown candidate "${id}". Known: ${CANDIDATE_MODELS.map((m) => m.id).join(', ') || 'none'}`);
  process.exit(2);
}

const checks = [];
const report = { candidate: candidate.id, displayName: candidate.displayName, webllmVersion: WEBLLM_VERSION, checks: [] };

async function getJSON(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { data: await res.json() };
  } catch (err) {
    return { error: err.cause?.code || err.message };
  }
}

// 1. Does the pinned WebLLM package mention this family?
{
  const meta = await getJSON(`https://registry.npmjs.org/@mlc-ai/web-llm/${WEBLLM_VERSION}`);
  if (meta.error) {
    checks.push({ name: 'WebLLM package reachable', pass: false, detail: meta.error });
  } else {
    const dir = mkdtempSync(join(tmpdir(), 'webllm-'));
    try {
      const tgz = join(dir, 'pkg.tgz');
      const res = await fetch(meta.data.dist.tarball, { signal: AbortSignal.timeout(60000) });
      writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
      execFileSync('tar', ['-xzf', tgz, '-C', dir]);
      let text = '';
      const walk = (d) => {
        for (const name of readdirSync(d)) {
          const full = join(d, name);
          if (statSync(full).isDirectory()) walk(full);
          else if (/\.(js|mjs|json|ts)$/.test(name) && statSync(full).size < 30_000_000) text += readFileSync(full, 'utf8');
        }
      };
      walk(dir);
      const hits = searchText(text, candidate.familyNeedles);
      const total = hits.reduce((n, h) => n + h.count, 0);
      report.webllmMatches = hits;
      checks.push({
        name: 'WebLLM build exists for this family',
        pass: total > 0,
        detail: total > 0 ? `${total} mention(s) in WebLLM ${WEBLLM_VERSION}` : `no mention of ${candidate.familyNeedles.join(', ')} in WebLLM ${WEBLLM_VERSION}`,
      });
    } catch (err) {
      checks.push({ name: 'WebLLM package reachable', pass: false, detail: err.message });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

// 2. Does a Hugging Face repo exist, with the files a runnable model needs?
for (const repo of candidate.hfRepos) {
  const info = await getJSON(`https://huggingface.co/api/models/${repo}?blobs=true`);
  if (info.error) {
    checks.push({ name: `Hugging Face repo ${repo}`, pass: false, detail: info.error });
    continue;
  }
  const files = summarizeHFFiles(info.data.siblings || []);
  const tags = info.data.tags || [];
  const licence = tags.find((t) => t.startsWith('license:')) || 'no licence tag';
  report.hf = { repo, licence, ...files };
  checks.push({ name: `Hugging Face repo ${repo} exists`, pass: true, detail: `${files.fileCount} files, ${files.totalMB} MB` });
  checks.push({ name: 'repo has config and tokenizer', pass: files.hasConfig && files.hasTokenizer, detail: `config ${files.hasConfig}, tokenizer ${files.hasTokenizer}` });
  checks.push({ name: 'repo has weight files', pass: files.hasWeights, detail: files.weightFiles.join(', ') || 'none' });
  break;
}
if (candidate.hfRepos.length === 0) checks.push({ name: 'Hugging Face repo listed in config', pass: false, detail: 'none' });

report.checks = checks;
const result = verdict(checks);
report.pass = result.pass;
report.failed = result.failed;
console.log(JSON.stringify(report, null, 2));
console.log(result.pass
  ? '\nAll checks passed. Read the licence, then move the entry into MODELS with its verified ids.'
  : `\nNot verified. Failed: ${result.failed.join('; ')}. Keep the candidate out of MODELS.`);
process.exit(result.pass ? 0 : 1);

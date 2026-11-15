// End-to-end browser test for online AI. It starts:
//   - the Velora app (a small static server for this folder),
//   - the real proxy (proxy/local-server.mjs) in a child process,
//   - a mock Gemini provider (tests/mock-gemini.mjs), which uses a fake key and no quota.
// Then it drives Chromium at a phone size and checks the setup, streaming, errors, Stop, reconnection,
// the offline fallback, the layout, and that the key never reaches the browser.
// It does NOT prove that a real provider works. Only a real key and a real provider can do that.
// Needs Playwright (see docs/ONLINE_AI_SETUP.md, "Developers"). Run with: node tests/browser-online.mjs
import { createRequire } from 'node:module';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockGemini } from './mock-gemini.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(process.env.SCREENSHOT_DIR || join(root, 'tests', 'screenshots'));
mkdirSync(shots, { recursive: true });
const KEY = 'AIzaFAKE-browser-key-0123456789abcdef';
const PROXY_PORT = 8788;
const PROXY = `http://127.0.0.1:${PROXY_PORT}`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? `\n       ${detail}` : ''}`);
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8' };
function staticServer() {
  return new Promise((done) => {
    const server = http.createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = join(root, path === '/' ? 'index.html' : path);
      if (!file.startsWith(root) || !existsSync(file) || file.includes(`${join(root, 'tests')}`)) {
        res.writeHead(404); res.end(); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => done({ server, port: server.address().port }));
  });
}

async function waitForProxy(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${url}/health`, { headers: { Origin: APP } });
      if (r.status) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('The local proxy did not start.');
}

const mock = await startMockGemini({ expectedKey: KEY });
const app = await staticServer();
const APP = `http://127.0.0.1:${app.port}`;
const child = spawn(process.execPath, [join(root, 'proxy', 'local-server.mjs')], {
  env: { ...process.env, PORT: String(PROXY_PORT), HOST: '127.0.0.1', API_KEY: KEY, ALLOWED_ORIGINS: APP, API_BASE: mock.url },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let childLog = '';
child.stdout.on('data', (d) => { childLog += d; });
child.stderr.on('data', (d) => { childLog += d; });
await waitForProxy(PROXY);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const pageErrors = [];
const leaks = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) pageErrors.push(`console: ${m.text()}`); });
page.on('request', async (r) => {
  const headers = JSON.stringify(r.headers());
  if (r.url().includes(KEY) || (r.postData() || '').includes(KEY) || headers.includes(KEY)) leaks.push(r.url());
});

const toastText = () => page.evaluate(() => {
  const t = document.getElementById('toast');
  return t && !t.hidden ? t.textContent : '';
});
const waitToast = async (text, timeout = 15000) => {
  try {
    await page.waitForFunction((s) => {
      const t = document.getElementById('toast');
      return !!t && !t.hidden && t.textContent.includes(s);
    }, text, { timeout });
  } catch (err) {
    const id = await page.evaluate(() => document.querySelector('.chat')?.dataset.conversation ?? '');
    const seen = await page.evaluate(async (id) => {
      const chat = await import('/js/ai/chat.js');
      const queue = await import('/js/ai/queue.js');
      return {
        toast: document.getElementById('toast')?.textContent,
        last: [...document.querySelectorAll('.msg')].slice(-2).map((m) => m.className + ': ' + m.textContent.slice(0, 80)),
        generating: chat.isGenerating(id),
        pendingJobs: queue.pendingJobs ? queue.pendingJobs() : 'n/a',
        sendLabel: document.querySelector('#send')?.getAttribute('aria-label'),
      };
    }, id);
    const received = (await (await fetch(`${mockOrigin}/__requests`)).json()).slice(-4).map((r) => {
      const contents = r.body.contents || [];
      return contents[contents.length - 1]?.parts?.[0]?.text?.slice(0, 40);
    });
    throw new Error(`Wanted toast "${text}". Saw: ${JSON.stringify(seen)}. Provider last received: ${JSON.stringify(received)}`);
  }
};
const bubbleText = () => page.evaluate(() => {
  const all = document.querySelectorAll('.msg--ai .bubble');
  return all.length ? all[all.length - 1].textContent : '';
});
const mockOrigin = new URL(mock.url).origin;
const mockRequestCount = async () => (await (await fetch(`${mockOrigin}/__requests`)).json()).length;
const lastAIBubble = () => page.evaluate(() => [...document.querySelectorAll('.msg--ai .bubble')].pop()?.textContent || '');
const waitIdle = () => page.waitForFunction(() => document.querySelector('#send')?.getAttribute('aria-label') === 'Send', null, { timeout: 20000 });
const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

try {
  // 1. Setup page
  await page.goto(`${APP}/index.html#/online`, { waitUntil: 'load' });
  await page.waitForSelector('#proxy-url');
  check('setup page opens at phone width without sideways scrolling', await noOverflow());
  check('setup page says the key stays in the proxy', (await page.textContent('main')).includes('Your key stays private'));
  await page.screenshot({ path: join(shots, '1-online-setup-390.png') });

  // 2. Save address and test the connection
  await page.fill('#proxy-url', PROXY);
  await page.click('#save-url');
  await waitToast('Address saved');
  await page.waitForTimeout(500); // the page redraws after saving; wait before the next click
  const requestsBeforeTest = await mockRequestCount();
  await page.click('#test');
  await waitToast('Connected to gemini', 20000);
  check('the test reaches the provider through the proxy and reports success', (await mockRequestCount()) === requestsBeforeTest + 1);

  // 3. Turn on
  await page.check('#consent');
  await page.waitForTimeout(500);
  await page.click('#use-online');
  await page.waitForFunction(() => location.hash === '#/profile', null, { timeout: 8000 });
  await page.waitForSelector('#mode-online');
  const profileText = await page.textContent('main');
  check('after the test, Profile shows Online AI as the mode', profileText.includes('Online AI (sent to your AI provider)'));
  await page.screenshot({ path: join(shots, '2-profile-online-390.png') });
  check('Profile has no sideways scrolling at phone width', await noOverflow());

  // 4. Start a chat with a starter character
  const conversationId = await page.evaluate(async () => {
    const db = await import('/js/data/db.js');
    const chat = await import('/js/ai/chat.js');
    const character = (await db.listCharacters()).find((c) => c.ageGate === 'adult');
    const conversation = await chat.openConversation(character);
    return conversation.id;
  });
  await page.goto(`${APP}/index.html#/chat/${conversationId}`, { waitUntil: 'load' });
  await page.waitForSelector('.mode-pill--online');
  check('the chat header shows the Online mode', (await page.textContent('.mode-pill')).trim() === 'Online');
  check('the chat has no sideways scrolling at phone width', await noOverflow());

  // 5. Normal reply, streamed
  await page.fill('#draft', 'Hello, how was your day?');
  await page.click('#send');
  await page.waitForFunction(() => [...document.querySelectorAll('.msg--ai .bubble')].pop()?.textContent.includes('Leans closer'), null, { timeout: 20000 });
  await waitIdle();
  const reply = await bubbleText();
  check('a reply from the provider appears in the chat', reply.includes('Tell me more about that') && reply.includes('Smiles'), reply);
  await page.screenshot({ path: join(shots, '3-chat-reply-390.png') });

  // 6. Streaming: the text is still growing while the provider is slow
  await page.fill('#draft', '[slow] Tell me a secret');
  await page.click('#send');
  await page.waitForTimeout(450);
  const partial = await bubbleText();
  await waitIdle();
  const complete = await bubbleText();
  check('text appears while the reply is still being written (streaming)', partial.length > 0 && complete.length > partial.length, `partial="${partial}" complete="${complete}"`);

  // 7. Stop keeps the text that arrived
  await page.fill('#draft', '[slow] keep talking');
  await page.click('#send');
  await page.waitForTimeout(450);
  await page.click('#send'); // Stop
  await waitIdle();
  check('Stop ends the reply without an error message', !(await toastText()).includes('could not'));
  check('the text that arrived before Stop is kept', (await bubbleText()).length > 0);

  // 8. Errors are shown plainly
  await page.fill('#draft', '[429] check the limit');
  await page.click('#send');
  await waitToast('limit has been reached', 20000);
  await waitIdle();
  check('a provider rate limit is shown as a plain message', true);

  await page.fill('#draft', '[safety] something blocked');
  await page.click('#send');
  await waitToast('safety filter', 20000);
  await waitIdle();
  check('a provider safety block is shown as a plain message', true);

  // 9. Connection lost mid-reply: the part that arrived is kept, and the next message works
  await page.fill('#draft', '[drop] are you still there');
  await page.click('#send');
  await waitToast('connection stopped', 20000);
  await waitIdle();
  check('a connection cut mid-reply keeps the part that arrived', (await bubbleText()).includes('Turns away slowly'));
  await page.fill('#draft', 'Are you back?');
  await page.click('#send');
  await page.waitForFunction(() => [...document.querySelectorAll('.msg--ai .bubble')].pop()?.textContent.includes('Leans closer'), null, { timeout: 20000 });
  await waitIdle();
  check('after a lost connection, the next message gets a full reply (reconnection)', true);

  // 10. The key never reached the browser
  const storageDump = await page.evaluate(async () => {
    const parts = [JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage })];
    const dbs = await indexedDB.databases();
    for (const info of dbs) {
      const handle = await new Promise((res, rej) => { const r = indexedDB.open(info.name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      for (const name of [...handle.objectStoreNames]) {
        const rows = await new Promise((res) => { const tx = handle.transaction(name); const q = tx.objectStore(name).getAll(); q.onsuccess = () => res(q.result); });
        parts.push(JSON.stringify(rows));
      }
      handle.close();
    }
    return parts.join('\n');
  });
  check('the provider key is not in browser storage', !storageDump.includes(KEY));
  check('the provider key is not in any request the page made', leaks.length === 0, leaks.join(', '));

  // 11. Offline fallback: an address that is not reachable turns online AI off
  const requestsAfterTests = await mockRequestCount();
  await page.goto(`${APP}/index.html#/online`, { waitUntil: 'load' });
  await page.waitForSelector('#proxy-url');
  await page.fill('#proxy-url', 'http://127.0.0.1:1');
  await page.click('#save-url');
  await waitToast('Address saved');
  await page.goto(`${APP}/index.html#/chat/${conversationId}`, { waitUntil: 'load' });
  await page.waitForSelector('.mode-pill');
  check('an unreachable new address switches the chat back to On device', (await page.textContent('.mode-pill')).trim() === 'On device');
  await page.fill('#draft', 'Hello from offline');
  await page.click('#send');
  await page.waitForFunction(() => /cannot run|not downloaded|no longer on this device/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 15000 });
  const offlineToast = await toastText();
  check('offline mode is the fallback, and it says what to do', /cannot run|not downloaded|no longer on this device/.test(offlineToast), offlineToast);
  await waitIdle();
  check('no online request is made in offline mode', (await mockRequestCount()) === requestsAfterTests);
  await page.screenshot({ path: join(shots, '4-chat-offline-fallback-390.png') });

  // 12. Layouts at phone width
  for (const [name, url] of [['discover', '#/discover'], ['chats', '#/chats'], ['profile', '#/profile'], ['models', '#/models']]) {
    await page.goto(`${APP}/index.html${url}`, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    check(`the ${name} page has no sideways scrolling at phone width`, await noOverflow());
  }

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
} catch (err) {
  check('the test run finished without an unexpected error', false, String(err && err.stack ? err.stack : err).split('\n').slice(0, 3).join(' '));
  console.log(childLog.slice(-600));
} finally {
  await browser.close();
  child.kill();
  mock.close();
  app.server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
console.log(`Screenshots: ${shots}`);
process.exit(failed.length ? 1 : 0);

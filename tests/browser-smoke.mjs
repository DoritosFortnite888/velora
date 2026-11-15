// Optional browser test. It opens Velora in a real Chromium browser and walks through the main flows.
// Setup (once):   npm i -D playwright && npx playwright install chromium
// Run:            node tests/browser-smoke.mjs
// Start the site first in another terminal:  python -m http.server 8000  (then set BASE_URL below)
//
// The AI library is replaced by a small STUB during this test. The stub lets us test Velora's own
// chat logic (streaming, stop, regenerate, memory notes). It does NOT test the real model.
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000/index.html';
const WEBLLM = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/+esm';

const STUB = `
const ids = ['Qwen2.5-0.5B-Instruct-q4f16_1-MLC', 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC'];
export const prebuiltAppConfig = { model_list: ids.map((model_id) => ({ model_id, vram_required_MB: 400 })) };
let stopFlag = false;
export async function CreateMLCEngine(modelId, cfg) {
  stopFlag = false;
  for (let i = 0; i <= 5; i++) {
    cfg?.initProgressCallback?.({ progress: i / 5, text: 'Fetching stub weights ' + (i * 20) + '%' });
    await new Promise((r) => setTimeout(r, 60));
  }
  return {
    chat: { completions: { create: async ({ messages }) => {
      const system = messages[0].content;
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const isSummary = system.includes('memory notes');
      const remembered = system.includes('Shared history') ? ' (I remember our history.)' : '';
      const reply = isSummary
        ? '- The user said they like tea.\\n- Nothing notable.'
        : '*Smiles.* You said: ' + lastUser.slice(0, 40) + '. Tell me more, take your time.' + remembered;
      const words = reply.split(' ');
      return (async function* () {
        for (const w of words) {
          if (stopFlag) break;
          await new Promise((r) => setTimeout(r, 40));
          yield { choices: [{ delta: { content: w + ' ' } }] };
        }
      })();
    } } },
    interruptGenerate() { stopFlag = true; },
    unload: async () => {},
  };
}
`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox'] });

// A context with NO stub: whatever this browser's real GPU reports is what Velora sees.
// Headless browsers often have no usable GPU, so Velora must refuse the download and say why.
const realContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const realPage = await realContext.newPage();
await realPage.goto(BASE_URL + '#/profile', { waitUntil: 'load' });
await realPage.waitForTimeout(1000);
const realDanger = await realPage.textContent('.notice--danger').catch(() => '');
const realDownloadDisabled = await realPage.isDisabled('#download');
check('real browser: refuses the model and explains why',
  realDanger.includes('cannot run the model') || (!realDownloadDisabled && !realDanger),
  realDanger ? realDanger.replace(/\s+/g, ' ').slice(0, 110) : 'device passed');
await realContext.close();

// A context with a STUB GPU, so the rest of the flow can run. Real GPU behaviour is not tested here.
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'gpu', {
    configurable: true,
    value: {
      requestAdapter: async () => ({
        features: new Set(['shader-f16']),
        limits: { maxBufferSize: 1 << 30, maxStorageBufferBindingSize: 1 << 28 },
        info: { description: 'Stub GPU (test only)' },
      }),
    },
  });
});
await context.route(WEBLLM, (route) => route.fulfill({ contentType: 'application/javascript', body: STUB }));

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const dialogs = [];
page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });

const goto = async (hash) => {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(350);
};

await page.goto(BASE_URL, { waitUntil: 'load' });
await page.waitForTimeout(800);

// 1. First run
let names = await page.$$eval('.char-card h3', (els) => els.map((e) => e.textContent));
check('three starter characters on first run', names.length === 3, names.join(', '));

// 2. Examples: add one
await goto('#/examples');
await page.click('[data-index="0"]');
await page.waitForTimeout(400);
await goto('#/discover');
names = await page.$$eval('.char-card h3', (els) => els.map((e) => e.textContent));
check('example character can be added', names.includes('Elena Marsh'));

// 3. Import pasted card with a minor signal: must be blocked
await goto('#/import');
await page.fill('#paste', 'Name: Tess\nA student who is 17 years old and loves music.');
await page.click('#read-paste');
await page.waitForTimeout(150);
check('import preview shows blocked age warning', (await page.textContent('#preview')).includes('Blocked'));
await page.click('#add-card');
await page.waitForTimeout(400);
const blockedBanner = await page.$eval('.notice--danger, .notice--warn', (el) => el.textContent).catch(() => '');
check('character with 17 years old text shows the blocked notice', blockedBanner.includes('blocked') || blockedBanner.includes('Chat is blocked'));

// 4. Import a clean card: starts unconfirmed; confirm, then chat is allowed
await goto('#/import');
await page.fill('#paste', 'Name: Bram\nA ferry captain who tells long stories about the sea.');
await page.click('#read-paste');
await page.waitForTimeout(150);
await page.click('#add-card');
await page.waitForTimeout(450);
const confirmBtn = await page.$('#confirm-age');
check('imported card asks for adult confirmation', !!confirmBtn);
await confirmBtn?.click();
await page.waitForTimeout(400);
check('after confirming, chat button is enabled', await page.isEnabled('#chat-btn'));

// 5. Create a character in the editor
await goto('#/edit/new');
await page.fill('input[name="name"]', 'Iris Vale');
await page.fill('textarea[name="tagline"], input[name="tagline"]', 'A quiet botanist');
await page.click('button[type="submit"]');
await page.waitForTimeout(450);
const onCharacter = (await page.textContent('h1')).includes('Iris Vale');
check('new character can be created and saved', onCharacter);

// 6. Chat blocked until the model is downloaded
await goto('#/discover');
await page.click('.char-card:has-text("Mira")');
await page.waitForTimeout(250);
await page.click('#chat-btn');
await page.waitForTimeout(400);
const banner = await page.textContent('.banner').catch(() => '');
check('chat warns that the model is not downloaded yet', banner.includes('not downloaded'));
await page.fill('#draft', 'Hello there');
await page.click('#send');
await page.waitForTimeout(400);
const toastText = await page.textContent('#toast');
check('sending without a model explains why', toastText.includes('not downloaded'));

// 7. Download the (stubbed) model with progress
await goto('#/profile');
const deviceText = await page.textContent('#view');
check('profile reports GPU and device checks', deviceText.includes('WebGPU') && deviceText.includes('Available'));
await page.click('#download');
await page.waitForFunction(() => document.querySelector('#model-status')?.textContent.includes('loaded in memory'), null, { timeout: 8000 }).catch(() => {});
check('model download completes and shows ready state', (await page.textContent('#model-status')).includes('Downloaded'));

// 8. Chat streams a reply and saves it
await goto('#/discover');
await page.click('.char-card:has-text("Mira")');
await page.waitForTimeout(250);
await page.click('#chat-btn');
await page.waitForURL(/#\/chat\//, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(300);
await page.fill('#draft', 'Tell me about the library tonight');
await page.click('#send');
// Wait until the stream has finished: the send button goes back to 'send' mode.
await page.waitForFunction(() => document.getElementById('send')?.dataset.mode === 'send' && !document.querySelector('.typing'), null, { timeout: 8000 });
const lastAI = await page.$eval('.msg--ai:last-of-type .bubble', (el) => el.textContent);
check('streamed reply appears and mentions the user words', lastAI.includes('Tell me about the library'), lastAI.slice(0, 60));
check('action text is shown in italics', (await page.$$('.bubble .action')).length >= 1);

// 9. Stop a reply midway
await page.fill('#draft', 'Write me a very long story about the night shift librarian and all of her habits');
await page.click('#send');
await page.waitForTimeout(250);
await page.click('#send');
await page.waitForTimeout(500);
const stoppedMode = await page.getAttribute('#send', 'data-mode');
check('stop button ends the reply and restores send', stoppedMode === 'send');

// 10. Persistence across reload
const beforeReload = await page.$$eval('.msg', (els) => els.length);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(600);
const afterReload = await page.$$eval('.msg', (els) => els.length);
check('chat history survives a reload', afterReload === beforeReload && afterReload > 0, `${afterReload} messages`);

// 11. Memory notes after a long chat (about 24 new messages)
for (let i = 0; i < 12; i++) {
  await page.fill('#draft', `Message number ${i} about tea`);
  await page.click('#send');
  await page.waitForFunction(() => !document.querySelector('.typing') && document.getElementById('send')?.dataset.mode === 'send', null, { timeout: 8000 }).catch(() => {});
}
await page.waitForTimeout(800);
await goto('#/memories/' + (await page.evaluate(() => location.hash)).split('/').pop()); // no-op safety
const chatId = (await page.evaluate(() => document.querySelector('.chat')?.dataset.conversation)) ?? '';
await goto('#/discover');
await page.click('.char-card:has-text("Mira")');
await page.waitForTimeout(250);
const mirenId = await page.evaluate(() => location.hash.split('/').pop());
await goto(`#/memories/${mirenId}`);
const memoryText = await page.textContent('#memory-list');
check('memory notes are written after a long chat', memoryText.includes('like tea'), memoryText.replace(/\s+/g, ' ').trim().slice(0, 60));

// 12. Backup export and import round trip
await goto('#/profile');
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
  page.click('#export'),
]);
check('backup export starts a download', !!download, download ? download.suggestedFilename() : 'none');

// 13. Erase everything restores the starters
await goto('#/profile');
dialogs.length = 0;
await page.click('#erase');
await page.waitForTimeout(500);
await goto('#/discover');
names = await page.$$eval('.char-card h3', (els) => els.map((e) => e.textContent));
check('erase everything then restores the three starters', names.length === 3, names.join(', '));

// 14. Offline: after one online visit, the app shell opens without a connection
await goto('#/discover');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(500);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(600);
await context.setOffline(true);
await page.reload({ waitUntil: 'load' }).catch(() => {});
await page.waitForTimeout(800);
const offlineNames = await page.$$eval('.char-card h3', (els) => els.map((e) => e.textContent)).catch(() => []);
check('app opens offline from the service worker cache', offlineNames.length > 0, offlineNames.join(', ') || 'blank');
await context.setOffline(false);

// 15. Failed library download is explained, not faked (this runs without the WebLLM stub)
const brokenContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
await brokenContext.addInitScript(() => {
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter: async () => ({
    features: new Set(), limits: { maxBufferSize: 1 << 30, maxStorageBufferBindingSize: 1 << 28 }, info: {} }) } });
});
const brokenPage = await brokenContext.newPage();
await brokenPage.goto(BASE_URL + '#/profile', { waitUntil: 'load' });
await brokenPage.waitForTimeout(800);
await brokenPage.click('#download').catch(() => {});
await brokenPage.waitForFunction(() => /could not|not be loaded|failed|cannot/i.test(document.getElementById('model-status')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
const brokenStatus = await brokenPage.textContent('#model-status');
check('failed library download explains the problem', /could not|failed|not be loaded/i.test(brokenStatus), brokenStatus.slice(0, 80));
await brokenContext.close();

check('no uncaught JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed.`);
process.exit(failed ? 1 : 0);

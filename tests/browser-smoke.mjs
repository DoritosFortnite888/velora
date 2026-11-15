// Optional browser test. It opens Velora in a real Chromium browser and walks through the main flows.
// Setup (once):   npm i -D playwright && npx playwright install chromium
// Run:            BASE_URL=http://127.0.0.1:8000/index.html node tests/browser-smoke.mjs
// (Start the site first, for example with: python -m http.server 8000)
//
// The AI library is replaced by a small STUB during this test. The stub records what Velora sends
// it, so the test can check Velora's prompts, length limits and reply rendering. It does NOT test a real model.
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000/index.html';
const WEBLLM = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/+esm';

const STUB = `
const ids = ['Qwen2.5-0.5B-Instruct-q4f16_1-MLC', 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC'];
export const prebuiltAppConfig = { model_list: ids.map((model_id) => ({ model_id, vram_required_MB: 400 })) };
let stopFlag = false;
globalThis.__calls = globalThis.__calls || [];
export async function CreateMLCEngine(modelId, cfg) {
  stopFlag = false;
  for (let i = 0; i <= 5; i++) {
    cfg?.initProgressCallback?.({ progress: i / 5, text: 'Fetching stub weights ' + (i * 20) + '%' });
    await new Promise((r) => setTimeout(r, 60));
  }
  return {
    chat: { completions: { create: async (request) => {
      const { messages } = request;
      globalThis.__calls.push({ system: messages[0].content, options: { ...request, messages: undefined } });
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const isSummary = messages[0].content.includes('memory notes');
      let reply;
      if (isSummary) reply = '- The user said they like tea.\\n- Nothing notable.';
      else if (lastUser.includes('MARKUP')) reply = '*smiles slightly* "Hi there, you."<img src=x onerror="window.__xss=1"> *nods*';
      else reply = '*Smiles.* You said: ' + lastUser.slice(0, 40) + '. Tell me more, take your time.';
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
const realContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const realPage = await realContext.newPage();
await realPage.goto(BASE_URL + '#/models', { waitUntil: 'load' });
await realPage.waitForTimeout(1000);
const realDanger = await realPage.textContent('.notice--danger').catch(() => '');
const realDownloadDisabled = await realPage.isDisabled('[data-download="qwen2.5-0.5b"]');
check('real browser: refuses the model and explains why',
  realDanger.includes('cannot run the model') || (!realDownloadDisabled && !realDanger),
  realDanger ? realDanger.replace(/\s+/g, ' ').slice(0, 110) : 'device passed');
await realContext.close();

// A context with a STUB GPU, so the rest of the flow can run.
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
page.on('dialog', (d) => d.accept());

const goto = async (hash) => {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(350);
};
const lastCall = () => page.evaluate(() => globalThis.__calls?.at(-1) ?? null);
const waitIdle = () => page.waitForFunction(
  () => document.getElementById('send')?.dataset.mode === 'send' && !document.querySelector('.typing'),
  null, { timeout: 8000 });
const characterIdByName = async (name) => page.evaluate(async (n) => {
  const rows = await new Promise((res) => {
    const q = indexedDB.open('velora');
    q.onsuccess = () => {
      const g = q.result.transaction('characters').objectStore('characters').getAll();
      g.onsuccess = () => res(g.result);
    };
  });
  return rows.find((c) => c.name === n)?.id ?? null;
}, name);

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

// 4. Import a clean card: confirmation needs an age of 18+
await goto('#/import');
await page.fill('#paste', 'Name: Bram\nA ferry captain who tells long stories about the sea.');
await page.click('#read-paste');
await page.waitForTimeout(150);
await page.click('#add-card');
await page.waitForTimeout(450);
check('imported card asks for adult confirmation with an age', !!(await page.$('#adult-age')));
await page.click('#confirm-age');
await page.waitForTimeout(300);
check('confirming without an age is refused', (await page.$('#adult-age')) !== null);
await page.fill('#adult-age', '30');
await page.click('#confirm-age');
await page.waitForTimeout(400);
check('after confirming with an age, chat button is enabled', await page.isEnabled('#chat-btn'));
const bramId = await page.evaluate(() => location.hash.split('/').pop());

// 5. Create a character in the editor
await goto('#/edit/new');
await page.fill('input[name="name"]', 'Iris Vale');
await page.fill('input[name="tagline"]', 'A quiet botanist');
await page.click('button[type="submit"]');
await page.waitForTimeout(450);
check('new character can be created and saved', (await page.textContent('h1')).includes('Iris Vale'));

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
check('sending without a model explains why', (await page.textContent('#toast')).includes('not downloaded'));

// 7. Download the (stubbed) model, and the roleplay rules panel is shown
await goto('#/profile');
check('profile reports GPU and device checks', (await page.textContent('#view')).includes('Available'));
check('profile explains roleplay and adult rules', (await page.textContent('#view')).includes('Romance is only for characters confirmed as adults'));
await goto('#/models');
await page.click('[data-download="qwen2.5-0.5b"]');
await page.waitForFunction(() => document.querySelector('[data-status="qwen2.5-0.5b"]')?.textContent.includes('Downloaded'), null, { timeout: 8000 }).catch(() => {});
check('model download completes and shows ready state', (await page.textContent('[data-status="qwen2.5-0.5b"]')).includes('Downloaded'));

// 8. Natural style, romance level and personality reach the model
await goto('#/discover');
await page.click('.char-card:has-text("Mira")');
await page.waitForTimeout(250);
await page.click('#chat-btn');
await page.waitForTimeout(400);
await page.fill('#draft', 'Tell me about the library tonight');
await page.click('#send');
await waitIdle();
const first = await lastCall();
check('model receives the natural style guide', !!first && first.system.includes('How to talk:'));
check('adult character with an age gets the romance level', !!first && first.system.includes('Romance level: Romantic'));
check('replies are kept short by default (180 tokens)', first?.options?.max_tokens === 180, String(first?.options?.max_tokens));
check('the model is told not to write the user\'s lines', Array.isArray(first?.options?.stop) && first.options.stop.some((s) => s.includes('User:')));
const lastAI = await page.$eval('.msg--ai:last-of-type .bubble', (el) => el.textContent);
check('streamed reply appears and mentions the user words', lastAI.includes('Tell me about the library tonight'), lastAI.slice(0, 60));
check('actions are rendered as small italic text', (await page.$$('.bubble .action')).length >= 1);

// 9. Malicious markup in a reply is shown as text, never run
await page.fill('#draft', 'MARKUP please');
await page.click('#send');
await waitIdle();
const markupBubble = await page.$$eval('.msg--ai .bubble', (els) => els.at(-1)?.innerHTML ?? '');
check('reply markup is escaped, not rendered as an image', !markupBubble.includes('<img'), markupBubble.slice(0, 80));
check('injected handler did not run', (await page.evaluate(() => window.__xss)) === undefined);

// 10. A request for detail gets the longer budget
await page.fill('#draft', 'describe the room in detail');
await page.click('#send');
await waitIdle();
const detailCall = await lastCall();
check('a request for detail allows a longer reply (420 tokens)', detailCall?.options?.max_tokens === 420, String(detailCall?.options?.max_tokens));

// 11. Stop a reply midway
await page.fill('#draft', 'Write me a very long story about the night shift librarian and all of her habits');
await page.click('#send');
await page.waitForTimeout(250);
await page.click('#send');
await page.waitForTimeout(500);
check('stop button ends the reply and restores send', (await page.getAttribute('#send', 'data-mode')) === 'send');

// 12. Persistence across reload
const beforeReload = await page.$$eval('.msg', (els) => els.length);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(600);
const afterReload = await page.$$eval('.msg', (els) => els.length);
check('chat history survives a reload', afterReload === beforeReload && afterReload > 0, `${afterReload} messages`);

// 13. Memory notes after a long chat
for (let i = 0; i < 12; i++) {
  await page.fill('#draft', `Message number ${i} about tea`);
  await page.click('#send');
  await waitIdle().catch(() => {});
}
await page.waitForTimeout(800);
const miraId = await characterIdByName('Mira');
await goto(`#/memories/${miraId}`);
const memoryText = await page.textContent('#memory-list');
check('memory notes are written after a long chat', memoryText.includes('like tea'), memoryText.replace(/\s+/g, ' ').trim().slice(0, 60));

// 13b. Memories can be edited, pinned, added, deleted, and they survive a reload (v1.2)
const firstMemory = page.locator('#memory-list .memory-item').first();
await firstMemory.locator('[data-edit]').click();
await firstMemory.locator('textarea').fill('The user likes green tea in the evening.');
await firstMemory.locator('button[type="submit"]').click();
await page.waitForTimeout(300);
check('a memory can be edited', (await page.textContent('#memory-list')).includes('green tea in the evening'));

await page.locator('#memory-list .memory-item').first().locator('[data-pin]').click();
await page.waitForTimeout(300);
check('a memory can be pinned', (await page.textContent('#memory-list')).includes('Pinned'));

await page.fill('#memory-form textarea', 'I am training for a half marathon in May');
await page.click('#memory-form button[type="submit"]');
await page.waitForTimeout(300);
await page.fill('#memory-form textarea', 'I am training for a half marathon in May');
await page.click('#memory-form button[type="submit"]');
await page.waitForTimeout(200);
check('a repeated memory is refused', (await page.textContent('#memory-error')).includes('already saved'));

await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(600);
check('memories survive closing and reopening the app', (await page.textContent('#memory-list')).includes('half marathon'));

await goto(`#/character/${miraId}`);
await page.click('#chat-btn');
await page.waitForTimeout(400);
await page.fill('#draft', 'What should we have for breakfast?');
await page.click('#send');
await waitIdle();
const memoryCall = await lastCall();
check('a pinned memory is sent with the next message', !!memoryCall?.system.includes('green tea in the evening'));
check('the prompt says not to invent shared history', !!memoryCall?.system.includes('Do not invent other shared history'));
check('the prompt includes the continuity rules', !!memoryCall?.system.includes('Continuity:'));
check('the prompt asks for quoted speech and asterisk actions', !!memoryCall?.system.includes('double quotes'));

await goto(`#/memories/${miraId}`);
const before = await page.locator('#memory-list .memory-item').count();
await page.locator('#memory-list .memory-item').last().locator('[data-delete]').click();
await page.waitForTimeout(300);
const after = await page.locator('#memory-list .memory-item').count();
check('a single memory can be deleted', after === before - 1, `${before} -> ${after}`);

await page.click('#clear-memories');
await page.waitForTimeout(300);
check('all memories for a character can be deleted at once', (await page.locator('#memory-list .memory-item').count()) === 0);

// 13c. Choosing a model does not download it, and the reply timing choice is saved
await goto('#/models');
await page.click('[data-use="llama-3.2-1b"]');
await page.waitForTimeout(500);
const chosenStatus = await page.textContent('[data-status="llama-3.2-1b"]');
check('choosing a larger model does not download it', chosenStatus.includes('Not downloaded'), chosenStatus.slice(0, 60));
check('the larger model is marked as not yet tested on a device', (await page.textContent('#view')).includes('Not yet run on an iPhone 14'));
check('the progress bar stays hidden after choosing', !(await page.isVisible('[data-progress-wrap="llama-3.2-1b"]')));
await page.click('[data-use="qwen2.5-0.5b"]');
await page.waitForTimeout(500);
check('switching back to the default model shows its own status', (await page.textContent('[data-status="qwen2.5-0.5b"]')).includes('Downloaded'));

await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(600);
check('the selected model is kept after a reload', (await page.textContent('[data-model="qwen2.5-0.5b"]')).includes('Selected'));

await goto(`#/character/${miraId}`);
await page.click('#chat-btn');
await page.waitForTimeout(400);
const startedAt = Date.now();
await page.fill('#draft', 'Quick question about the shelves');
await page.click('#send');
await waitIdle();
const elapsed = Date.now() - startedAt;
check('the reply is not held back by an artificial timer', elapsed < 4000, `${elapsed} ms`);

// Stopping while Velora is still preparing removes the empty reply and restores send
await page.fill('#draft', 'Another quick one');
await page.click('#send');
await page.waitForTimeout(400);
await page.click('#send');
await page.waitForTimeout(600);
const emptyReplies = await page.$$eval('.msg--ai .bubble', (els) => els.filter((e) => !e.textContent.trim()).length);
check('stopping during preparation removes the empty reply', emptyReplies === 0, `${emptyReplies} empty`);
check('send is ready again after stopping during preparation', (await page.getAttribute('#send', 'data-mode')) === 'send');


// 14. Adult character with confirmed age gets romance; the prompt says so
await goto(`#/character/${bramId}`);
await page.click('#chat-btn');
await page.waitForTimeout(400);
await page.fill('#draft', 'Hello captain');
await page.click('#send');
await waitIdle();
const bramCall = await lastCall();
check('confirmed adult with an age of 30 gets the romance level', !!bramCall?.system.includes('Romance level:'));

// 15. Editing traits and turning romance off changes the next prompt
await goto(`#/edit/${miraId}`);
// Users tap the visible label; the checkbox itself is visually hidden.
await page.click('label[for="trait-shy"]');
await page.fill('input[name="statedAge"]', '29');
await page.evaluate(() => {
  const slider = document.querySelector('input[name="romanceIntensity"]');
  slider.value = '0';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.click('button[type="submit"]');
await page.waitForTimeout(450);
await goto(`#/character/${miraId}`);
await page.click('#chat-btn');
await page.waitForTimeout(400);
await page.fill('#draft', 'Hello again');
await page.click('#send');
await waitIdle();
const editedCall = await lastCall();
check('saved trait reaches the prompt', !!editedCall?.system.includes('Shy'));
check('romance set to Off is respected', !!editedCall?.system.includes('Romance: off'));

// 16. Backup export and import round trip
await goto('#/profile');
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
  page.click('#export'),
]);
check('backup export starts a download', !!download, download ? download.suggestedFilename() : 'none');

// 17. Offline: after one online visit, the app shell opens without a connection
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

// 18. Erase everything restores the starters
await goto('#/profile');
await page.click('#erase');
await page.waitForTimeout(500);
await goto('#/discover');
names = await page.$$eval('.char-card h3', (els) => els.map((e) => e.textContent));
check('erase everything then restores the three starters', names.length === 3, names.join(', '));

// 19. Failed library download is explained, not faked (no stub for the library here)
const brokenContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
await brokenContext.addInitScript(() => {
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter: async () => ({
    features: new Set(), limits: { maxBufferSize: 1 << 30, maxStorageBufferBindingSize: 1 << 28 }, info: {} }) } });
});
const brokenPage = await brokenContext.newPage();
brokenPage.on('dialog', (d) => d.accept()); // the download asks the user to confirm the size
await brokenPage.goto(BASE_URL + '#/models', { waitUntil: 'load' });
await brokenPage.waitForTimeout(800);
await brokenPage.click('[data-download="qwen2.5-0.5b"]').catch(() => {});
await brokenPage.waitForFunction(() => /could not|not be loaded|failed|cannot/i.test(document.querySelector('.toast, #toast')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
const brokenStatus = await brokenPage.textContent('#toast').catch(() => '');
check('failed library download explains the problem', /could not|failed|not be loaded/i.test(brokenStatus), brokenStatus.slice(0, 80));
await brokenContext.close();

// 20. On-device speed test. The stub model answers, so these numbers prove the wiring, not the speed of a phone.
// The erase above removed the download, so download the model again first, as a user would.
await goto('#/models');
await page.click('[data-download="qwen2.5-0.5b"]').catch(() => {});
await page.waitForFunction(() => /Downloaded/.test(document.querySelector('[data-download="qwen2.5-0.5b"]')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
await goto('#/profile');
await page.click('#speed');
await page.waitForFunction(() => /Speed test:/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
const speedToast = await page.textContent('#toast').catch(() => '');
check('the speed test reports time to first word and writing speed (stub model)', /Speed test:.*first word/.test(speedToast), speedToast.slice(0, 90));
check('the profile page shows the reply timing rows', (await page.textContent('body')).includes('median time to first word'));

// 21. An iPhone is refused the 3B model before any download starts
const iosContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
});
const iosPage = await iosContext.newPage();
iosPage.on('dialog', (d) => d.accept());
await iosPage.goto(BASE_URL + '#/models', { waitUntil: 'load' });
await iosPage.waitForTimeout(800);
const iosBody = await iosPage.textContent('body');
const iosDisabled = await iosPage.isDisabled('[data-download="llama-3.2-3b"]').catch(() => false);
check('an iPhone is refused the 3B model before any download', iosBody.includes('too large for an iPhone Safari tab') && iosDisabled);
await iosContext.close();

// 22. Automatic choice and the investigated OpenAI models (no network needed for these checks)
await goto('#/models');
const modelsText = await page.textContent('body');
check('the Models page explains automatic choice', modelsText.includes('Automatic choice'));
check('the Models page lists GPT-OSS as not offered, with a reason', modelsText.includes('GPT-OSS 20B') && modelsText.includes('Not offered'));
// Picking a model by hand turns automatic choice off, and switching back on keeps the downloaded model
await page.click('[data-use="llama-3.2-1b"]').catch(() => {});
await page.waitForTimeout(400);
check('choosing a model by hand turns automatic choice off', (await page.textContent('body')).includes('Automatic choice is off'));
await page.click('#auto-on').catch(() => {});
await page.waitForTimeout(400);
const autoBody = await page.textContent('body');
check('turning automatic choice back on uses the downloaded model', autoBody.includes('Automatic choice is on'));
check('the downloaded 0.5B model is the one selected again', (await page.textContent('[data-model="qwen2.5-0.5b"]')).includes('Selected'));

check('no uncaught JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed.`);
process.exit(failed ? 1 : 0);

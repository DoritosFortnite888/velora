import { APP_NAME } from '../../core/config.js';
import {
  getOnlineState,
  getAIMode,
  saveProxyUrl,
  setOnlineConsent,
  recordVerification,
  chooseOnline,
  chooseOffline,
} from '../../ai/mode.js';
import { testOnlineConnection } from '../../ai/online.js';
import { esc, pageHeader, notice, toast, ICON } from '../dom.js';

const when = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export async function renderOnline() {
  const state = await getOnlineState();
  const mode = await getAIMode();

  const verifiedLine = state.verified
    ? notice('ok', `${ICON.check}<p>The last test succeeded on ${esc(when(state.verified.at))}${state.verified.provider ? ` (provider: ${esc(state.verified.provider)}, model: ${esc(state.verified.model || 'not reported')})` : ''}.</p>`)
    : notice('info', '<p>Not tested yet. Online AI cannot be turned on until a test succeeds.</p>');

  const html = `
    ${pageHeader({ eyebrow: APP_NAME, title: 'Online AI setup', back: '#/profile' })}
    <div class="stack">
      <section class="panel">
        <div class="panel-head">${ICON.cloud}<h2>What online AI does</h2></div>
        <p class="muted">Online AI writes replies with a hosted language model instead of the model on this device. It can follow longer chats and write more varied replies. It needs the internet.</p>
        <ul class="rules-list">
          <li><strong>Your chats leave this device.</strong> Each reply sends the character details, the recent messages and the memories that match them to the AI provider, through your proxy. Short memory notes written from long chats are sent too.</li>
          <li><strong>Your key stays private.</strong> The provider key is stored in your proxy, never in this web page, browser storage or the project files.</li>
          <li><strong>Free tiers may be used to improve products.</strong> Read the provider's terms before you use it for chats you want to keep private.</li>
          <li><strong>Offline stays available.</strong> On this device keeps working as the fallback, and nothing changes for your characters, chats or memories.</li>
        </ul>
        <p class="muted small">Setup steps for Windows are in docs/ONLINE_AI_SETUP.md in the project.</p>
      </section>

      <section class="panel">
        <div class="panel-head">${ICON.download}<h2>1. Proxy address</h2></div>
        <p class="muted">Paste the address of the proxy you deployed. It starts with https://. Do not add anything after it.</p>
        <label class="field">
          <span>Proxy address</span>
          <input id="proxy-url" type="url" inputmode="url" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="https://velora-proxy.yourname.workers.dev" value="${esc(state.proxyUrl)}">
        </label>
        <div class="btn-row"><button class="btn btn--ghost" id="save-url" type="button">Save address</button></div>
      </section>

      <section class="panel">
        <div class="panel-head">${ICON.check}<h2>2. Test connection</h2></div>
        <p class="muted">The test checks the proxy and asks the AI provider one tiny question. It uses a few tokens of your provider's free quota. No chat is sent.</p>
        ${verifiedLine}
        <div class="btn-row"><button class="btn btn--primary" id="test" type="button">Test connection</button></div>
        <p class="status" id="test-result" hidden></p>
      </section>

      <section class="panel">
        <div class="panel-head">${ICON.shield}<h2>3. Turn on</h2></div>
        <label class="check">
          <input type="checkbox" id="consent" ${state.consentAt ? 'checked' : ''}>
          <span>I understand that my chats, the character details, the memories used for each reply, and the short notes Velora writes from longer chats are sent to the AI provider set up in my proxy.</span>
        </label>
        <p class="muted small">You can switch back to On this device at any time, and you can turn this off here.</p>
        <div class="btn-row">
          ${mode === 'online'
            ? '<button class="btn btn--ghost" id="use-offline" type="button">Use On this device instead</button>'
            : '<button class="btn btn--primary" id="use-online" type="button">Use Online AI</button>'}
        </div>
        <p class="muted small">Current mode: <strong>${mode === 'online' ? 'Online AI' : 'On this device'}</strong>.</p>
      </section>
    </div>`;

  return {
    html,
    bind(root, { rerender }) {
      const input = root.querySelector('#proxy-url');
      const result = root.querySelector('#test-result');

      root.querySelector('#save-url').addEventListener('click', async () => {
        try {
          await saveProxyUrl(input.value);
          toast('Address saved. Now run Test connection.', 4500);
          rerender();
        } catch (err) {
          toast(err.message, 7000);
        }
      });

      root.querySelector('#consent').addEventListener('change', async (e) => {
        await setOnlineConsent(e.target.checked);
        if (!e.target.checked) toast('Online AI is off. Chats stay on this device.', 4000);
        rerender();
      });

      root.querySelector('#test').addEventListener('click', async (e) => {
        const button = e.currentTarget;
        if (input.value.trim() !== (state.proxyUrl || '')) {
          toast('Save the address first, then test it.', 5000);
          return;
        }
        if (!state.proxyUrl) {
          toast('Enter the proxy address and save it first.', 5000);
          return;
        }
        button.disabled = true;
        button.textContent = 'Testing…';
        result.hidden = false;
        result.textContent = 'Asking the proxy and the AI provider…';
        try {
          const info = await testOnlineConnection(state.proxyUrl);
          await recordVerification(info);
          toast(`Connected to ${info.provider} (${info.model}).`, 6000);
          rerender();
        } catch (err) {
          result.textContent = err.message;
          toast(err.message, 8000);
          button.disabled = false;
          button.textContent = 'Test connection';
        }
      });

      root.querySelector('#use-online')?.addEventListener('click', async () => {
        try {
          await chooseOnline();
          toast('Online AI is on. New replies will use your proxy.', 5000);
          location.hash = '#/profile';
        } catch (err) {
          toast(err.message, 8000);
        }
      });

      root.querySelector('#use-offline')?.addEventListener('click', async () => {
        await chooseOffline();
        toast('On this device is on.', 4000);
        rerender();
      });
    },
  };
}

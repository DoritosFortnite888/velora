import * as db from '../../data/db.js';
import { APP_VERSION, APP_NAME, DEVICE } from '../../core/config.js';
import { formatMB } from '../../core/util.js';
import { getDeviceReport } from '../../ai/device.js';
import { selectedSpec, downloadRecord, downloadModel, removeModel } from '../../ai/model-store.js';
import { resolveModelId, isModelLoaded } from '../../ai/engine.js';
import { esc, pageHeader, notice, toast, confirmAction, ICON } from '../dom.js';
import { seedStartersIfEmpty } from '../../data/db.js';
import { starterCharacters } from '../../core/starters.js';

const yesNo = (value) => (value ? 'Yes' : 'No');

function deviceRows(r) {
  const row = (label, value) => `<div class="info-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  return [
    row('WebGPU', r.hasWebGPU ? 'Available' : 'Not available'),
    row('Graphics adapter', r.hasAdapter ? (r.adapterName || 'Found') : 'Not found'),
    row('16-bit shaders', r.hasAdapter ? yesNo(r.hasF16) : 'Unknown'),
    row('Largest GPU buffer', r.maxBufferMB ? formatMB(r.maxBufferMB) : 'Unknown'),
    row('Secure connection (HTTPS)', yesNo(r.secureContext)),
    row('RAM reported by browser', r.deviceMemoryGB ? `${r.deviceMemoryGB} GB` : 'Not reported'),
    row('Browser storage', r.storageQuotaMB ? `${formatMB(r.storageUsedMB)} used of ${formatMB(r.storageQuotaMB)}` : 'Unknown'),
    row('Storage kept safe from clearing', r.persisted === null ? 'Unknown' : yesNo(r.persisted)),
  ].join('');
}

export async function renderProfile() {
  const report = await getDeviceReport();
  const spec = await selectedSpec();
  const record = await downloadRecord(spec);
  const downloaded = !!record?.downloadedAt;
  const loaded = isModelLoaded(resolveModelId(spec, report.hasF16));

  const statusText = loaded
    ? 'Downloaded and loaded in memory. Ready to chat.'
    : downloaded
      ? 'Downloaded. It loads into memory when you first chat.'
      : 'Not downloaded yet. Download it once while you have Wi-Fi.';

  const deviceNotice = report.ok
    ? notice('ok', `${ICON.check}<p>This device passes the basic checks. These checks are estimates. The model can still fail to load on a device that passes them.</p>`)
    : notice('danger', `${ICON.shield}<div><strong>This device cannot run the model yet</strong><ul>${report.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`);

  const html = `
    ${pageHeader({ eyebrow: APP_NAME, title: 'Profile' })}
    <div class="stack">
      <section class="panel">
        <div class="panel-head">${ICON.cpu}<h2>On-device AI</h2></div>
        ${deviceNotice}
        <div class="info-list">${deviceRows(report)}</div>
        ${report.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('')}
        <button class="btn btn--ghost" id="recheck" type="button">Check again</button>
      </section>

      <section class="panel">
        <div class="panel-head">${ICON.download}<h2>AI model</h2></div>
        <div class="model-card">
          <strong>${esc(spec.displayName)}</strong>
          <p class="muted">${esc(spec.summary)}</p>
          <small class="muted">Licence: ${esc(spec.license)}. Runs fully on this device. Conversations are never sent to a server.</small>
        </div>
        <p class="status-line" id="model-status">${esc(statusText)}</p>
        <div class="progress" id="progress" hidden><div class="progress__bar" id="progress-bar"></div></div>
        <p class="muted small" id="progress-text" hidden></p>
        <div class="btn-row">
          <button class="btn btn--primary" id="download" type="button" ${report.ok ? '' : 'disabled'}>${downloaded ? 'Check model files' : 'Download model'}</button>
          <button class="btn btn--danger" id="remove" type="button" ${downloaded ? '' : 'disabled'}>Delete model files</button>
        </div>
        <p class="note">The model is downloaded once and then kept on this device. Safari may clear it if your phone runs short of space. If that happens, Velora downloads it again the next time you chat.</p>
        <p class="note">Offline use is not guaranteed yet. After downloading, test it with Airplane Mode on. The steps are in docs/IPHONE_INSTALL.md.</p>
      </section>

      <section class="panel">
        <div class="panel-head">${ICON.shield}<h2>Roleplay and adult content</h2></div>
        <ul class="rules-list">
          <li>Romance is only for characters confirmed as adults, with an age of 18 or more on record. Otherwise romance stays off.</li>
          <li>Velora never writes sexually explicit content, and never involves anyone under 18 or anyone whose age is unclear.</li>
          <li>The same rules are sent with every message, but a small model can still ignore them. Stay in control of the scene.</li>
          <li>You can stop any reply, say stop, change the subject, or delete the chat at any time.</li>
          <li>No AI model is unrestricted. Each model has its own training and limits, and Velora cannot change that.</li>
        </ul>
      </section>

      <section class="panel">
        <div class="panel-head">${ICON.cloud}<h2>Storage and backup</h2></div>
        <p class="muted">Characters, chats and memories are stored in this browser on this device. Export a backup now and then, because Safari can clear website data.</p>
        <div class="btn-row">
          <button class="btn btn--ghost" id="persist" type="button">Ask Safari to keep my data</button>
          <button class="btn btn--ghost" id="export" type="button">${ICON.download} Export backup</button>
        </div>
        <label class="btn btn--ghost btn--wide file-button">${ICON.upload} Import a backup
          <input id="import" type="file" accept=".json,application/json" hidden>
        </label>
      </section>

      <section class="panel panel--danger">
        <h2>Erase everything</h2>
        <p class="muted">Deletes every character, chat, memory and setting stored by Velora on this device. The downloaded model files are also removed.</p>
        <button class="btn btn--danger" id="erase" type="button">${ICON.trash} Erase everything</button>
      </section>

      <section class="panel">
        <h2>About Velora</h2>
        <p class="muted">Version ${esc(APP_VERSION)}. No accounts, no API keys and no subscriptions. Chats stay on this device. After setup, Velora does not need the internet to chat, although offline use still needs testing on your phone.</p>
        <p class="muted small">Storage limit: about ${DEVICE.storageNeededMB} MB is needed for the model. Your browser decides the total.</p>
      </section>
    </div>`;

  return {
    html,
    bind(root, { rerender }) {
      const progress = root.querySelector('#progress');
      const bar = root.querySelector('#progress-bar');
      const progressText = root.querySelector('#progress-text');
      const statusEl = root.querySelector('#model-status');
      const download = root.querySelector('#download');
      const remove = root.querySelector('#remove');

      root.querySelector('#recheck').addEventListener('click', () => {
        getDeviceReport({ force: true }).then(() => rerender());
      });

      download.addEventListener('click', async () => {
        download.disabled = true;
        remove.disabled = true;
        progress.hidden = false;
        progressText.hidden = false;
        statusEl.textContent = 'Downloading the model. Keep Velora open until this finishes.';
        try {
          await downloadModel(spec, ({ progress: p, text }) => {
            bar.style.width = `${Math.min(100, Math.round(p * 100))}%`;
            progressText.textContent = text || 'Preparing…';
          });
          toast('The model is ready on this device.');
          rerender();
        } catch (err) {
          statusEl.textContent = err.message;
          statusEl.classList.add('is-error');
          download.disabled = false;
          remove.disabled = !downloaded;
        }
      });

      remove.addEventListener('click', async () => {
        if (!confirmAction('Delete the downloaded model files? You will need to download them again before chatting.')) return;
        remove.disabled = true;
        try {
          await removeModel(spec);
          toast('Model files deleted.');
          rerender();
        } catch (err) {
          toast(err.message, 6000);
          remove.disabled = false;
        }
      });

      root.querySelector('#persist').addEventListener('click', async () => {
        if (!navigator.storage?.persist) {
          toast('This browser does not offer a way to keep storage. Export a backup regularly instead.', 6000);
          return;
        }
        const granted = await navigator.storage.persist().catch(() => false);
        toast(granted
          ? 'Safari will try to keep your data.'
          : 'Safari did not promise to keep your data. Export a backup regularly.', 6000);
        getDeviceReport({ force: true }).then(() => rerender());
      });

      root.querySelector('#export').addEventListener('click', async () => {
        const data = await db.exportBackup();
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `velora-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);
        toast('Backup created. On iPhone it may open in the share sheet, where you can save it to Files.', 6000);
      });

      root.querySelector('#import').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
          const data = JSON.parse(await file.text());
          const counts = await db.importBackup(data);
          toast(`Imported ${counts.characters} characters and ${counts.conversations} chats.`, 5000);
          rerender();
        } catch (err) {
          toast(err.message.startsWith('This file') ? err.message : 'That backup could not be read.', 6000);
        }
      });

      root.querySelector('#erase').addEventListener('click', async () => {
        if (!confirmAction('Erase everything in Velora on this device? This cannot be undone.')) return;
        if (!confirmAction('Are you sure? Characters, chats, memories and the downloaded model will be removed.')) return;
        try {
          await removeModel(spec).catch(() => {});
          await db.eraseEverything();
          await seedStartersIfEmpty(starterCharacters());
          toast('Everything was erased. The starter characters were restored.', 5000);
          location.hash = '#/discover';
        } catch (err) {
          toast(err.message, 6000);
        }
      });
    },
  };
}

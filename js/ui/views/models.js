// The model selection screen. Lists every model with its size, memory estimate, intelligence and
// speed, and lets the user download (after confirming), cancel, delete, or switch between models.
// Nothing here downloads a model without a tap and a confirmation.
import { MODELS, DEVICE } from '../../core/config.js';
import { formatMB } from '../../core/util.js';
import { getDeviceReport } from '../../ai/device.js';
import { isGenerating } from '../../ai/chat.js';
import {
  selectedSpec,
  chooseModel,
  downloadModel,
  cancelDownload,
  removeModel,
  modelStatus,
  downloadProgress,
  isDownloadBusy,
  interruptedLoad,
  clearInterruptedLoad,
  downloadingSpecId,
  DownloadCancelled,
  CANCELLED_MESSAGE,
} from '../../ai/model-store.js';
import { esc, pageHeader, notice, toast, confirmAction, ICON } from '../dom.js';

const memoryText = (spec) => (spec.vramMB
  ? `About ${formatMB(spec.vramMB)} of GPU memory (WebLLM's own figure).`
  : 'Not published for this model. Check Profile for your device limits.');

const sizeText = (spec) => spec.sizeNote;

function statusLine(status, progress) {
  if (status.downloading) {
    const pct = Math.round((progress?.progress ?? 0) * 100);
    return `Downloading, ${pct}%`;
  }
  if (status.loaded) return 'Downloaded and in memory now.';
  if (status.downloaded) return 'Downloaded. Ready to use.';
  return 'Not downloaded.';
}

function modelCardHTML(spec, { selected, status, progress, report }) {
  const tags = [
    spec.tier ? `<span class="tag">${esc(spec.tier)}</span>` : '',
    selected ? '<span class="tag tag--pin">Selected</span>' : '',
    spec.recommended ? '<span class="tag">Best fit for iPhone 14 (untested)</span>' : '',
  ].join('');

  const warnings = [
    spec.untested ? '<p class="note">Not yet run on an iPhone 14 by this project. It may fail to load.</p>' : '',
    spec.highMemory ? '<p class="note is-warn">This model is likely too large for an iPhone 14 Safari tab. Expect failures or page reloads.</p>' : '',
  ].join('');

  const busy = isDownloadBusy();
  const downloadDisabled = !report.ok || status.downloaded || busy;
  const actions = [
    `<button class="btn btn--ghost" type="button" data-use="${esc(spec.id)}"${selected || busy ? ' disabled' : ''}>${selected ? 'Selected' : 'Use this model'}</button>`,
    status.downloading
      ? `<button class="btn btn--ghost" type="button" data-cancel="${esc(spec.id)}">Cancel download</button>`
      : `<button class="btn btn--primary" type="button" data-download="${esc(spec.id)}"${downloadDisabled ? ' disabled' : ''}>${status.downloaded ? 'Downloaded' : 'Download'}</button>`,
    `<button class="btn btn--danger" type="button" data-remove="${esc(spec.id)}"${status.downloaded && !status.downloading && !busy ? '' : ' disabled'}>Delete files</button>`,
  ].join('');

  return `
    <section class="panel model-card${selected ? ' is-selected' : ''}" data-model="${esc(spec.id)}">
      <div class="model-card__head">
        <div>
          <h2>${esc(spec.displayName)}</h2>
          <div class="tag-row">${tags}</div>
        </div>
      </div>
      <p class="muted">${esc(spec.summary)}</p>
      <dl class="info-list model-facts">
        <div class="info-row"><span>Download size</span><strong>${esc(sizeText(spec))}</strong></div>
        <div class="info-row"><span>Memory</span><strong>${esc(memoryText(spec))}</strong></div>
        <div class="info-row"><span>Intelligence</span><strong>${esc(spec.intelligence)}</strong></div>
        <div class="info-row"><span>Speed</span><strong>${esc(spec.speed)}</strong></div>
        <div class="info-row"><span>Licence</span><strong>${esc(spec.license)}</strong></div>
      </dl>
      ${warnings}
      <p class="status-line" data-status="${esc(spec.id)}">${esc(statusLine(status, progress))}</p>
      <div class="progress" data-progress-wrap="${esc(spec.id)}"${status.downloading ? '' : ' hidden'}>
        <div class="progress__bar" data-progress-bar="${esc(spec.id)}" style="width:${Math.round((progress?.progress ?? 0) * 100)}%"></div>
      </div>
      <p class="muted small" data-progress-text="${esc(spec.id)}"${status.downloading ? '' : ' hidden'}>${esc(progress?.text || '')}</p>
      <div class="btn-row">${actions}</div>
    </section>`;
}

export async function renderModels() {
  const report = await getDeviceReport();
  const selected = await selectedSpec();
  const interrupted = await interruptedLoad();
  const progress = downloadProgress();

  const cards = [];
  for (const spec of MODELS) {
    const status = await modelStatus(spec);
    cards.push(modelCardHTML(spec, {
      selected: spec.id === selected.id,
      status,
      progress: status.downloading ? progress : null,
      report,
    }));
  }

  const deviceNotice = report.ok
    ? ''
    : notice('danger', `${ICON.shield}<div><strong>This device cannot run the models yet</strong><ul>${report.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`);

  const interruptedNotice = interrupted
    ? notice('warn', `<div><strong>The last load of ${esc(interrupted.displayName)} did not finish</strong><p>Safari may have reloaded the page, often because the phone ran short of memory. Try the smaller 0.5B or Llama 3.2 1B model, and close other apps before chatting.</p><button class="btn btn--ghost" type="button" id="dismiss-interrupted">Dismiss</button></div>`)
    : '';

  const html = `
    ${pageHeader({ eyebrow: 'Profile', title: 'AI models', back: '#/profile' })}
    <div class="stack">
      ${deviceNotice}
      ${interruptedNotice}
      <section class="panel">
        <p class="muted small">Choosing a model does not download it. Each download starts only when you tap Download and confirm the size. One download runs at a time. Files stay on this device, so your chats and characters are not affected by switching or deleting a model.</p>
        <p class="muted small">Sizes and memory figures are estimates. Velora has not measured them on an iPhone 14.</p>
      </section>
      ${cards.join('')}
      <section class="panel">
        <p class="note">If a model fails to load, switch back to Qwen2.5 0.5B. It is the smallest and the most likely to run.</p>
        <p class="note">Cancelling stops Velora waiting for a download. The library cannot stop a file that is already arriving, so it may finish in the background. Files already saved are reused next time.</p>
        <p class="note">Safari may clear downloaded files when storage is low. Velora then asks before downloading them again.</p>
      </section>
    </div>`;

  return {
    html,
    bind(root, { rerender }) {
      const specById = (id) => MODELS.find((m) => m.id === id);
      const setBusy = (busy) => {
        root.querySelectorAll('[data-use],[data-download],[data-remove]').forEach((button) => {
          if (busy) button.disabled = true;
        });
      };

      root.querySelector('#dismiss-interrupted')?.addEventListener('click', async () => {
        await clearInterruptedLoad();
        rerender();
      });

      root.querySelectorAll('[data-use]').forEach((button) => {
        button.addEventListener('click', async () => {
          if (isGenerating()) {
            toast('Velora is still writing a reply. Wait for it to finish, or tap stop, before switching models.', 5000);
            return;
          }
          const spec = specById(button.dataset.use);
          try {
            await chooseModel(spec.id);
            toast(`${spec.displayName} is selected. ${(await modelStatus(spec)).downloaded ? 'It is ready to use.' : 'Download it to use it.'}`, 4500);
            rerender();
          } catch (err) {
            toast(err.message, 6000);
          }
        });
      });

      root.querySelectorAll('[data-download]').forEach((button) => {
        button.addEventListener('click', async () => {
          const spec = specById(button.dataset.download);
          const ok = confirmAction(`Download ${spec.displayName}? ${spec.sizeNote} Keep Velora open until it finishes.`);
          if (!ok) return;

          const bar = root.querySelector(`[data-progress-bar="${spec.id}"]`);
          const text = root.querySelector(`[data-progress-text="${spec.id}"]`);
          const statusEl = root.querySelector(`[data-status="${spec.id}"]`);
          root.querySelector(`[data-progress-wrap="${spec.id}"]`).hidden = false;
          text.hidden = false;
          setBusy(true);

          // Keeps the bar moving even if the user leaves this page and comes back.
          const timer = setInterval(() => {
            if (!root.isConnected) { clearInterval(timer); return; }
            const p = downloadProgress();
            if (p && bar) {
              bar.style.width = `${Math.min(100, Math.round(p.progress * 100))}%`;
              text.textContent = p.text || 'Preparing…';
              statusEl.textContent = `Downloading, ${Math.round(p.progress * 100)}%`;
            }
          }, 400);

          try {
            await downloadModel(spec, ({ progress: p, text: t }) => {
              if (bar) bar.style.width = `${Math.min(100, Math.round(p * 100))}%`;
              if (text) text.textContent = t || 'Preparing…';
            });
            clearInterval(timer);
            toast(`${spec.displayName} is ready on this device.`, 4500);
            rerender();
          } catch (err) {
            clearInterval(timer);
            if (err instanceof DownloadCancelled) {
              toast(CANCELLED_MESSAGE, 7000);
            } else {
              toast(err.message, 8000);
            }
            rerender();
          }
        });
      });

      root.querySelectorAll('[data-cancel]').forEach((button) => {
        button.addEventListener('click', () => {
          const spec = specById(button.dataset.cancel);
          if (!confirmAction(`Cancel the download of ${spec.displayName}?`)) return;
          cancelDownload();
          button.disabled = true;
        });
      });

      root.querySelectorAll('[data-remove]').forEach((button) => {
        button.addEventListener('click', async () => {
          const spec = specById(button.dataset.remove);
          if (!confirmAction(`Delete the downloaded files for ${spec.displayName}? You can download them again later. Your chats, characters and other models are not affected.`)) return;
          button.disabled = true;
          try {
            await removeModel(spec);
            toast(`${spec.displayName} files were deleted.`, 4500);
            rerender();
          } catch (err) {
            toast(err.message, 6000);
            button.disabled = false;
          }
        });
      });

      // While a download runs, keep its bar in step with the progress. This also works after the user
      // leaves this page and comes back, because the progress is kept by the model store.
      const activeId = downloadingSpecId();
      if (activeId) {
        const timer = setInterval(() => {
          if (!root.isConnected) { clearInterval(timer); return; }
          const p = downloadProgress();
          if (!p) { clearInterval(timer); return; }
          const bar = root.querySelector(`[data-progress-bar="${activeId}"]`);
          if (bar) bar.style.width = `${Math.min(100, Math.round(p.progress * 100))}%`;
        }, 400);
      }
    },
  };
}

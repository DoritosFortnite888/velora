import * as db from '../../data/db.js';
import { AGE_GATE } from '../../core/safety.js';
import { parseCardFile, parsePasted, cardToCharacter, CardError, allCardText } from '../../core/cards.js';
import { suggestsMinor } from '../../core/safety.js';
import { esc, pageHeader, notice, toast, ICON } from '../dom.js';

const FORMAT_LABELS = {
  'card-v1': 'Card V1 (JSON)',
  'card-v2': 'Card V2 (JSON)',
  'card-v3': 'Card V3 (JSON)',
  'png-card-v1': 'PNG card (V1)',
  'png-card-v2': 'PNG card (V2)',
  'png-card-v3': 'PNG card (V3)',
  pasted: 'Pasted text',
};

export async function renderImport() {
  const html = `
    ${pageHeader({ eyebrow: 'Character cards', title: 'Import', back: '#/discover' })}
    <div class="stack">
      <section class="panel">
        <h2>From a file</h2>
        <p class="muted">JSON cards (V1 or V2), or PNG cards that have character data inside them.</p>
        <label class="btn btn--primary btn--wide file-button">${ICON.upload} Choose a card file
          <input id="file" type="file" accept=".json,.png,application/json,image/png" hidden>
        </label>
      </section>

      <section class="panel">
        <h2>From pasted text</h2>
        <p class="muted">Paste a JSON card, or plain text about the character. Start with <code>Name: Their name</code> to set the name.</p>
        <label class="field"><span class="sr-only">Pasted card or text</span>
          <textarea id="paste" rows="6" placeholder="Name: Mira&#10;A calm night-shift librarian..."></textarea>
        </label>
        <button class="btn btn--ghost" id="read-paste" type="button">Read text</button>
      </section>

      <div id="message"></div>
      <div id="preview"></div>

      ${notice('info', `${ICON.shield}<p>Imported characters start <strong>unconfirmed</strong>. You confirm on their profile page that they are 18 or older before you can chat.</p>`)}
    </div>`;

  return {
    html,
    bind(root) {
      const message = root.querySelector('#message');
      const preview = root.querySelector('#preview');

      const showError = (text) => {
        message.innerHTML = notice('danger', `<p>${esc(text)}</p>`);
        preview.innerHTML = '';
      };

      const showPreview = (card) => {
        message.innerHTML = '';
        const character = cardToCharacter(card);
        const ageText = character.ageGate === AGE_GATE.FLAGGED
          ? 'Blocked: the text suggests a person under 18. Edit it after importing.'
          : character.ageGate === AGE_GATE.UNCONFIRMED
            ? 'Not yet confirmed. Confirm 18+ on the profile page before chatting.'
            : 'Confirmed adult.';
        const hasMinor = suggestsMinor(allCardText(card));
        preview.innerHTML = `
          <section class="panel import-preview">
            <h2>Preview</h2>
            <div class="info-row"><span>Name</span><strong>${esc(card.name)}</strong></div>
            <div class="info-row"><span>Format</span><strong>${esc(FORMAT_LABELS[card.format] ?? card.format)}</strong></div>
            ${card.description ? `<p class="clamp">${esc(card.description)}</p>` : ''}
            ${card.tags.length ? `<div class="tags">${card.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
            ${card.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('')}
            <p class="${hasMinor ? 'error' : 'muted'}">${esc(ageText)}</p>
            <div class="btn-row">
              <button class="btn btn--primary" id="add-card" type="button">Add to Discover</button>
              <button class="btn btn--ghost" id="cancel-card" type="button">Cancel</button>
            </div>
          </section>`;

        preview.querySelector('#cancel-card').addEventListener('click', () => {
          preview.innerHTML = '';
        });
        preview.querySelector('#add-card').addEventListener('click', async (e) => {
          e.currentTarget.disabled = true;
          try {
            await db.saveCharacter(character);
            toast(`${card.name} was added.`);
            location.hash = `#/character/${character.id}`;
          } catch (err) {
            e.currentTarget.disabled = false;
            toast(err.message, 6000);
          }
        });
      };

      root.querySelector('#file').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          showPreview(parseCardFile(bytes));
        } catch (err) {
          showError(err instanceof CardError ? err.message : `The file could not be read. (${err.message})`);
        }
      });

      root.querySelector('#read-paste').addEventListener('click', () => {
        const text = root.querySelector('#paste').value;
        try {
          showPreview(parsePasted(text));
        } catch (err) {
          showError(err.message);
        }
      });
    },
  };
}

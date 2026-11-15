import * as db from '../../data/db.js';
import { loadExampleCards, exampleToCharacter } from '../../core/examples.js';
import { esc, pageHeader, toast, ICON } from '../dom.js';

export async function renderExamples() {
  const cards = loadExampleCards();
  const existing = await db.listCharacters();
  const addedNames = new Set(existing.map((c) => c.name));

  const html = `
    ${pageHeader({ eyebrow: 'Fictional adults', title: 'Examples', back: '#/discover' })}
    <p class="muted">Eight original, fictional adult characters with different personalities. Adding one copies it into your Discover list, where you can edit it.</p>
    <div class="stack" id="examples">
      ${cards.map((card, i) => `
        <article class="example-row">
          <div class="avatar avatar--initial avatar--sm" style="--hue:${(i * 47) % 360}" aria-hidden="true">${esc(card.name.split(' ').map((p) => p[0]).slice(0, 2).join(''))}</div>
          <div class="example-row__body">
            <h3>${esc(card.name)}</h3>
            <p>${esc(card.description.split(/[.!?]/)[0])}.</p>
            <div class="tags">${card.tags.slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
          </div>
          <button class="btn ${addedNames.has(card.name) ? 'btn--ghost' : 'btn--primary'} btn--small" type="button" data-index="${i}" ${addedNames.has(card.name) ? 'disabled' : ''}>
            ${addedNames.has(card.name) ? `${ICON.check} Added` : 'Add'}
          </button>
        </article>`).join('')}
    </div>`;

  return {
    html,
    bind(root, { rerender }) {
      root.querySelector('#examples').addEventListener('click', async (e) => {
        const button = e.target.closest('[data-index]');
        if (!button || button.disabled) return;
        const card = cards[Number(button.dataset.index)];
        button.disabled = true;
        await db.saveCharacter(exampleToCharacter(card));
        toast(`${card.name} was added to Discover.`);
        rerender();
      });
    },
  };
}

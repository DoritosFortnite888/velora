import * as db from '../../data/db.js';
import { AGE_GATE } from '../../core/safety.js';
import { esc, avatarHTML, pageHeader, emptyState, ICON } from '../dom.js';

export async function renderDiscover() {
  const characters = await db.listCharacters();
  const tags = [...new Set(characters.flatMap((c) => c.tags || []))].sort((a, b) => a.localeCompare(b));

  const html = `
    ${pageHeader({
      eyebrow: 'Velora',
      title: 'Discover',
      actions: `
        <a class="icon-btn" href="#/import" aria-label="Import a character card" title="Import a card">${ICON.upload}</a>
        <a class="icon-btn icon-btn--accent" href="#/edit/new" aria-label="Create a character" title="Create a character">${ICON.plus}</a>`,
    })}
    <label class="search">
      <span class="sr-only">Search characters</span>
      <input id="search" type="search" placeholder="Search characters" autocomplete="off" enterkeyhint="search">
    </label>
    ${tags.length ? `
      <div class="chips" id="chips" role="group" aria-label="Filter by tag">
        <button type="button" class="chip is-active" data-tag="">All</button>
        ${tags.map((t) => `<button type="button" class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>` : ''}
    <div id="grid" class="grid"></div>`;

  return {
    html,
    bind(root) {
      let query = '';
      let tag = '';
      const grid = root.querySelector('#grid');

      const cardHTML = (c) => {
        const badge = c.ageGate === AGE_GATE.FLAGGED
          ? '<span class="badge badge--danger">Blocked</span>'
          : c.ageGate === AGE_GATE.UNCONFIRMED
            ? '<span class="badge badge--warn">Confirm 18+</span>'
            : '';
        return `
          <a class="char-card" href="#/character/${c.id}">
            <div class="char-card__art">${avatarHTML(c, 'avatar--card')}${c.isFavourite ? `<span class="fav-dot" aria-label="Favourite">${ICON.star}</span>` : ''}</div>
            <div class="char-card__body">
              <h3>${esc(c.name)}</h3>
              <p>${esc(c.tagline || 'No description yet')}</p>
              <div class="tags">${(c.tags || []).slice(0, 2).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}${badge}</div>
            </div>
          </a>`;
      };

      const paint = () => {
        if (characters.length === 0) {
          grid.innerHTML = emptyState({
            title: 'No characters yet',
            text: 'Create one, import a character card, or browse the examples.',
            action: '<a class="btn btn--primary" href="#/examples">Browse example characters</a>',
          });
          return;
        }
        const q = query.trim().toLowerCase();
        const list = characters
          .filter((c) => !tag || (c.tags || []).includes(tag))
          .filter((c) => !q || [c.name, c.tagline, ...(c.tags || [])].join(' ').toLowerCase().includes(q))
          .sort((a, b) => Number(b.isFavourite) - Number(a.isFavourite) || a.name.localeCompare(b.name));
        grid.innerHTML = list.length
          ? list.map(cardHTML).join('')
          : '<p class="muted center">No characters match your search.</p>';
      };

      root.querySelector('#search').addEventListener('input', (e) => {
        query = e.target.value;
        paint();
      });
      root.querySelector('#chips')?.addEventListener('click', (e) => {
        const button = e.target.closest('[data-tag]');
        if (!button) return;
        tag = button.dataset.tag;
        root.querySelectorAll('.chip').forEach((chip) => chip.classList.toggle('is-active', chip === button));
        paint();
      });
      paint();
    },
  };
}

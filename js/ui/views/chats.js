import * as db from '../../data/db.js';
import { timeAgo } from '../../core/util.js';
import { esc, avatarHTML, pageHeader, emptyState, ICON } from '../dom.js';

export async function renderChats() {
  const [conversations, characters] = await Promise.all([db.listConversations(), db.listCharacters()]);
  const byId = new Map(characters.map((c) => [c.id, c]));
  const rows = conversations.filter((c) => byId.has(c.characterId));

  const html = `
    ${pageHeader({ eyebrow: 'Velora', title: 'Chats' })}
    ${rows.length ? `
      <label class="search">
        <span class="sr-only">Search chats</span>
        <input id="chat-search" type="search" placeholder="Search chats" autocomplete="off">
      </label>
      <div id="chat-list" class="chat-list"></div>`
      : emptyState({
        title: 'No chats yet',
        text: 'Open a character in Discover and start talking. Your chats stay on this device.',
        action: '<a class="btn btn--primary" href="#/discover">Find a character</a>',
      })}`;

  return {
    html,
    bind(root) {
      const list = root.querySelector('#chat-list');
      if (!list) return;
      const paint = (query = '') => {
        const q = query.trim().toLowerCase();
        const shown = rows.filter((c) => {
          const character = byId.get(c.characterId);
          return !q || `${character.name} ${c.preview || ''}`.toLowerCase().includes(q);
        });
        list.innerHTML = shown.length
          ? shown.map((c) => {
            const character = byId.get(c.characterId);
            return `
              <a class="chat-row" href="#/chat/${c.id}">
                ${avatarHTML(character, 'avatar--md')}
                <div class="chat-row__body">
                  <div class="chat-row__top"><strong>${esc(character.name)}</strong><time>${esc(timeAgo(c.updatedAt))}</time></div>
                  <p>${esc(c.preview || 'No messages yet')}</p>
                </div>
                <span class="chevron" aria-hidden="true">${ICON.back}</span>
              </a>`;
          }).join('')
          : '<p class="muted center">No chats match your search.</p>';
      };
      root.querySelector('#chat-search').addEventListener('input', (e) => paint(e.target.value));
      paint();
    },
  };
}

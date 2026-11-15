import * as db from '../../data/db.js';
import { AGE_GATE } from '../../core/safety.js';
import { ROLE_STYLES } from '../../core/config.js';
import { hueFromString } from '../../core/util.js';
import { chatBlockReason, openConversation } from '../../ai/chat.js';
import { esc, avatarHTML, ICON, notFoundPage, toast, confirmAction } from '../dom.js';

function section(title, text, mono = false) {
  if (!text || !text.trim()) return '';
  return `
    <section class="info-block">
      <h2>${esc(title)}</h2>
      <p class="${mono ? 'mono' : ''}">${esc(text)}</p>
    </section>`;
}

export async function renderCharacter(id) {
  const c = await db.getCharacter(id);
  if (!c) return notFoundPage('This character no longer exists.');

  const block = chatBlockReason(c);
  const ageCard = c.ageGate === AGE_GATE.FLAGGED
    ? `<div class="notice notice--danger">${ICON.shield}<div>
         <strong>Chat is blocked</strong>
         <p>This character's text suggests they may be under 18. Remove any ages or school references that do not apply, then save.</p>
         <a class="btn btn--ghost btn--small" href="#/edit/${c.id}">Edit character</a></div></div>`
    : c.ageGate === AGE_GATE.UNCONFIRMED
      ? `<div class="notice notice--warn">${ICON.shield}<div>
           <strong>Confirm this character is an adult</strong>
           <p>Chat, flirting and romance are only allowed with characters confirmed as 18 or older. Velora never writes sexual content.</p>
           <button class="btn btn--primary btn--small" id="confirm-age" type="button">I confirm this character is 18+</button></div></div>`
      : '';

  const html = `
    <section class="profile-hero" style="--hue:${hueFromString(c.name)}">
      <div class="profile-hero__glow" aria-hidden="true"></div>
      <a class="icon-btn profile-hero__back" href="#/discover" aria-label="Back to Discover">${ICON.back}</a>
      ${avatarHTML(c, 'avatar--hero')}
      <h1>${esc(c.name)}</h1>
      ${c.tagline ? `<p class="tagline">${esc(c.tagline)}</p>` : ''}
      ${(c.tags || []).length ? `<div class="tags tags--center">${c.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
    </section>

    <div class="stack">
      <button class="btn btn--primary btn--wide" id="chat-btn" type="button" ${block ? 'disabled' : ''}>
        ${ICON.chats}Chat with ${esc(c.name)}
      </button>
      ${ageCard}
      ${section('About', c.backstory)}
      ${section('Personality', c.personality)}
      ${section('Opening line', c.greeting)}
      ${section('Scenario', c.scenario)}
      ${section('Example dialogue', c.exampleDialogue)}
      <div class="info-row">
        <span>Roleplay style</span>
        <strong>${esc(ROLE_STYLES[c.roleStyle]?.label ?? 'Balanced')}</strong>
      </div>
      ${c.creator ? `<div class="info-row"><span>Creator</span><strong>${esc(c.creator)}</strong></div>` : ''}
      <div class="actions-grid">
        <a class="btn btn--ghost" href="#/edit/${c.id}">${ICON.edit} Edit</a>
        <a class="btn btn--ghost" href="#/memories/${c.id}">${ICON.memory} Memories</a>
        <button class="btn btn--ghost" id="fav-btn" type="button">${ICON.star} ${c.isFavourite ? 'Unfavourite' : 'Favourite'}</button>
        <button class="btn btn--danger" id="delete-btn" type="button">${ICON.trash} Delete</button>
      </div>
    </div>`;

  return {
    html,
    bind(root, { rerender }) {
      root.querySelector('#chat-btn')?.addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        try {
          const conversation = await openConversation(c);
          location.hash = `#/chat/${conversation.id}`;
        } catch (err) {
          toast(err.message, 5000);
          e.currentTarget.disabled = false;
        }
      });

      root.querySelector('#confirm-age')?.addEventListener('click', async () => {
        const fresh = await db.getCharacter(c.id);
        if (fresh && fresh.ageGate === AGE_GATE.UNCONFIRMED) {
          fresh.ageGate = AGE_GATE.ADULT;
          fresh.updatedAt = Date.now();
          await db.saveCharacter(fresh);
          toast(`${c.name} is confirmed as an adult. Chat is open.`);
        }
        rerender();
      });

      root.querySelector('#fav-btn')?.addEventListener('click', async () => {
        const fresh = await db.getCharacter(c.id);
        if (!fresh) return;
        fresh.isFavourite = !fresh.isFavourite;
        await db.saveCharacter(fresh);
        rerender();
      });

      root.querySelector('#delete-btn')?.addEventListener('click', async () => {
        if (!confirmAction(`Delete ${c.name}? Their chats and memories will be deleted too. This cannot be undone.`)) return;
        await db.deleteCharacter(c.id);
        toast(`${c.name} was deleted.`);
        location.hash = '#/discover';
      });
    },
  };
}

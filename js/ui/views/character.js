import * as db from '../../data/db.js';
import { AGE_GATE } from '../../core/safety.js';
import { ROLE_STYLES, PERSONALITY_TRAITS } from '../../core/config.js';
import { hueFromString } from '../../core/util.js';
import { contentMode, ADULT_MIN_AGE } from '../../core/persona.js';
import { chatBlockReason, openConversation } from '../../ai/chat.js';
import { esc, avatarHTML, ICON, notFoundPage, toast, confirmAction } from '../dom.js';

function section(title, text) {
  if (!text || !text.trim()) return '';
  return `
    <section class="info-block">
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
    </section>`;
}

function romanceSummary(c) {
  const mode = contentMode(c);
  if (c.ageGate !== AGE_GATE.ADULT) return 'Off until confirmed as an adult';
  if (mode.reason === 'age-unclear') return `Off: add an age of ${ADULT_MIN_AGE} or more in Edit`;
  if (mode.reason === 'off') return 'Off';
  return mode.level.label;
}

export async function renderCharacter(id) {
  const c = await db.getCharacter(id);
  if (!c) return notFoundPage('This character no longer exists.');

  const block = chatBlockReason(c);
  const traits = (c.personalityTraits || []).filter((k) => PERSONALITY_TRAITS[k]);

  const ageCard = c.ageGate === AGE_GATE.FLAGGED
    ? `<div class="notice notice--danger">${ICON.shield}<div>
         <strong>Chat is blocked</strong>
         <p>This character's text or age suggests they may be under 18. Remove any ages or school references that do not apply, then save.</p>
         <a class="btn btn--ghost btn--small" href="#/edit/${c.id}">Edit character</a></div></div>`
    : c.ageGate === AGE_GATE.UNCONFIRMED
      ? `<div class="notice notice--warn">${ICON.shield}<div>
           <strong>Confirm this character is an adult</strong>
           <p>Enter the character's age. Chat is only open for characters 18 or older. Romance also needs an age on record.</p>
           <div class="age-row">
             <input id="adult-age" type="number" inputmode="numeric" min="18" max="120" placeholder="Age" aria-label="Character's age">
             <button class="btn btn--primary btn--small" id="confirm-age" type="button">Confirm 18+</button>
           </div></div></div>`
      : '';

  const romanceNote = c.ageGate === AGE_GATE.ADULT && contentMode(c).reason === 'age-unclear'
    ? `<div class="notice notice--info">${ICON.shield}<div><p>Romance is off, because no age of ${ADULT_MIN_AGE} or more is on record. <a href="#/edit/${c.id}">Add an age in Edit</a>.</p></div></div>`
    : '';

  const html = `
    <section class="profile-hero" style="--hue:${hueFromString(c.name)}">
      <div class="profile-hero__glow" aria-hidden="true"></div>
      <a class="icon-btn profile-hero__back" href="#/discover" aria-label="Back to Discover">${ICON.back}</a>
      ${avatarHTML(c, 'avatar--hero')}
      <h1>${esc(c.name)}</h1>
      ${c.tagline ? `<p class="tagline">${esc(c.tagline)}</p>` : ''}
      ${c.statedAge ? `<p class="small muted">Age ${esc(c.statedAge)}</p>` : ''}
      ${(c.tags || []).length ? `<div class="tags tags--center">${c.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
    </section>

    <div class="stack">
      <button class="btn btn--primary btn--wide" id="chat-btn" type="button" ${block ? 'disabled' : ''}>
        ${ICON.chats}Chat with ${esc(c.name)}
      </button>
      ${ageCard}
      ${romanceNote}
      ${section('About', c.backstory)}
      ${traits.length ? `
        <section class="info-block">
          <h2>Personality</h2>
          <div class="tags">${traits.map((k) => `<span class="tag">${esc(PERSONALITY_TRAITS[k].label)}</span>`).join('')}</div>
          ${c.customPersonality ? `<p class="stack-tight" style="margin-top:10px">${esc(c.customPersonality)}</p>` : ''}
        </section>` : (c.customPersonality ? section('Personality', c.customPersonality) : '')}
      ${section('Personality notes', c.personality)}
      ${section('Opening line', c.greeting)}
      ${section('Scenario', c.scenario)}
      ${section('Example dialogue', c.exampleDialogue)}
      <div class="info-row"><span>Narration</span><strong>${esc(ROLE_STYLES[c.roleStyle]?.label ?? 'Balanced')}</strong></div>
      <div class="info-row"><span>Reply length</span><strong>${esc(c.replyLength === 'medium' ? 'Medium' : c.replyLength === 'detailed' ? 'Detailed' : 'Short')}</strong></div>
      <div class="info-row"><span>Romance</span><strong>${esc(romanceSummary(c))}</strong></div>
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
        const input = root.querySelector('#adult-age');
        const age = Number(input.value);
        if (!Number.isInteger(age) || age < ADULT_MIN_AGE || age > 120) {
          toast(`Enter the character's age as a whole number, ${ADULT_MIN_AGE} or older.`, 5000);
          input.focus();
          return;
        }
        const fresh = await db.getCharacter(c.id);
        if (fresh && fresh.ageGate === AGE_GATE.UNCONFIRMED) {
          fresh.ageGate = AGE_GATE.ADULT;
          fresh.statedAge = age;
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

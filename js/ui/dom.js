// Shared DOM helpers: icons, avatars, message formatting, page headers and the toast message.
import { escapeHTML, hueFromString, initialsOf } from '../core/util.js';
import { renderRoleplayHTML } from '../core/format.js';

export const esc = escapeHTML;
export const $ = (selector, root = document) => root.querySelector(selector);

const svg = (body) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  discover: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'),
  chats: svg('<path d="M4 5h16v11H9l-5 4V5z"/>'),
  profile: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  upload: svg('<path d="M12 15V4M7 9l5-5 5 5M5 15v4h14v-4"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  refresh: svg('<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4"/>'),
  memory: svg('<path d="M12 3a6 6 0 0 0-6 6c0 2 1 3 2 4v3h8v-3c1-1 2-2 2-4a6 6 0 0 0-6-6z"/><path d="M9 20h6"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>'),
  send: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
  star: svg('<path d="M12 4l2.5 5.2 5.5.7-4 3.8 1 5.5L12 16.6 7 19.2l1-5.5-4-3.8 5.5-.7z"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  shield: svg('<path d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6l8-3z"/>'),
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  cpu: svg('<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>'),
  book: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/>'),
  cloud: svg('<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a3.5 3.5 0 0 1 0 9H7z"/>'),
  sparkle: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>'),
};

// A round picture of the character, or coloured initials when there is no picture.
export function avatarHTML(character, size = '') {
  const cls = `avatar ${size}`.trim();
  if (character.avatar) {
    return `<img class="${cls}" src="${esc(character.avatar)}" alt="" loading="lazy">`;
  }
  return `<div class="${cls} avatar--initial" style="--hue:${hueFromString(character.name)}" aria-hidden="true">${esc(initialsOf(character.name))}</div>`;
}

// Turns a reply into safe HTML. *Actions* show in a smaller italic font. Speech is normal text.
// See js/core/format.js. Every piece of text is escaped, so no HTML can be injected.
export function formatText(text) {
  return renderRoleplayHTML(text);
}

export const TYPING_HTML = '<span class="typing" aria-label="Writing"><i></i><i></i><i></i></span>';

export function pageHeader({ eyebrow = '', title, back = '', actions = '' }) {
  return `
    <header class="page-header">
      <div class="page-header__start">
        ${back ? `<a class="icon-btn" href="${back}" aria-label="Back">${ICON.back}</a>` : ''}
        <div class="page-header__titles">
          ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
          <h1>${esc(title)}</h1>
        </div>
      </div>
      <div class="page-header__actions">${actions}</div>
    </header>`;
}

export function notice(kind, html) {
  return `<div class="notice notice--${kind}">${html}</div>`;
}

export function emptyState({ title, text, action = '' }) {
  return `
    <section class="empty">
      <div class="empty__icon">${ICON.sparkle}</div>
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
      ${action}
    </section>`;
}

export function notFoundPage(text) {
  return {
    html: `${pageHeader({ title: 'Not found', back: '#/discover' })}${emptyState({
      title: 'Nothing here',
      text,
      action: '<a class="btn btn--primary" href="#/discover">Go to Discover</a>',
    })}`,
  };
}

let toastTimer = 0;
export function toast(message, ms = 3200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
    el.hidden = true;
  }, ms);
}

export function confirmAction(message) {
  return window.confirm(message);
}

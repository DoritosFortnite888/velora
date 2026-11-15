// Velora entry point: a tiny hash router (works on GitHub Pages and in the iPhone Home Screen app),
// first-run setup, and service worker registration for offline use of the website.
import * as db from './data/db.js';
import { starterCharacters } from './core/starters.js';
import { esc } from './ui/dom.js';
import { renderDiscover } from './ui/views/discover.js';
import { renderChats } from './ui/views/chats.js';
import { renderProfile } from './ui/views/profile.js';
import { renderCharacter } from './ui/views/character.js';
import { renderEditor } from './ui/views/editor.js';
import { renderImport } from './ui/views/importer.js';
import { renderExamples } from './ui/views/examples.js';
import { renderChat } from './ui/views/chat.js';
import { renderMemories } from './ui/views/memories.js';

const VIEWS = {
  discover: () => renderDiscover(),
  chats: () => renderChats(),
  profile: () => renderProfile(),
  character: (id) => renderCharacter(id),
  edit: (id) => renderEditor(id),
  import: () => renderImport(),
  examples: () => renderExamples(),
  chat: (id) => renderChat(id),
  memories: (id) => renderMemories(id),
};

const TAB_ROUTES = ['discover', 'chats', 'profile'];
let routeToken = 0;

function parseHash() {
  const path = location.hash.replace(/^#\/?/, '');
  const [name = '', ...rest] = path.split('/');
  return { name, arg: rest.join('/') };
}

async function route() {
  const { name, arg } = parseHash();
  const key = Object.prototype.hasOwnProperty.call(VIEWS, name) ? name : 'discover';
  const token = ++routeToken;

  document.body.dataset.route = key;
  document.querySelectorAll('.tabbar a').forEach((link) => {
    if (link.dataset.tab === key) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  const root = document.getElementById('view');
  try {
    const page = await VIEWS[key](arg);
    if (token !== routeToken) return; // a newer navigation has started
    root.innerHTML = page.html;
    root.scrollTop = 0;
    page.bind?.(root, { rerender: () => route() });
  } catch (err) {
    if (token !== routeToken) return;
    root.innerHTML = `
      <section class="empty">
        <h2>Something went wrong</h2>
        <p>${esc(err.message || String(err))}</p>
        <a class="btn btn--primary" href="#/discover">Back to Discover</a>
      </section>`;
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Offline support could not be enabled:', err);
    });
  });
}

async function boot() {
  registerServiceWorker();
  try {
    await db.openDB();
    await db.seedStartersIfEmpty(starterCharacters());
  } catch (err) {
    document.getElementById('view').innerHTML = `
      <section class="empty">
        <h2>Velora cannot save data</h2>
        <p>${esc(err.message)}</p>
        <p class="muted small">Try a current version of Safari or Chrome, turn off private browsing, and reload.</p>
      </section>`;
    return;
  }
  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = '#/discover';
  route();
}

boot();

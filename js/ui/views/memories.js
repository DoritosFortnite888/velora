import * as db from '../../data/db.js';
import { MEMORY_KINDS } from '../../core/config.js';
import { suggestsMinor } from '../../core/safety.js';
import { isDuplicateMemory } from '../../core/memory.js';
import { newId } from '../../core/util.js';
import { esc, pageHeader, notFoundPage, emptyState, toast, confirmAction, ICON } from '../dom.js';

const kindOptions = (selected) => Object.entries(MEMORY_KINDS)
  .map(([key, label]) => `<option value="${key}"${key === selected ? ' selected' : ''}>${esc(label)}</option>`)
  .join('');

const kindLabel = (kind) => MEMORY_KINDS[kind] ?? 'Memory';

function memoryItemHTML(m) {
  const pinLabel = m.pinned ? 'Unpin memory' : 'Pin memory';
  return `
    <article class="memory-item" data-memory="${esc(m.id)}">
      <div class="memory-body">
        <div class="memory-view">
          <span class="tag">${esc(kindLabel(m.kind))}</span>
          ${m.pinned ? '<span class="tag tag--pin">Pinned</span>' : ''}
          <p>${esc(m.text)}</p>
        </div>
        <form class="memory-edit stack-tight" data-edit-form="${esc(m.id)}" hidden>
          <label class="field"><span>Memory</span>
            <textarea name="text" rows="2" maxlength="200">${esc(m.text)}</textarea>
          </label>
          <label class="field"><span>Type</span>
            <select name="kind">${kindOptions(m.kind)}</select>
          </label>
          <p class="error" data-edit-error hidden></p>
          <div class="btn-row">
            <button class="btn btn--primary" type="submit">Save changes</button>
            <button class="btn btn--ghost" type="button" data-cancel>Cancel</button>
          </div>
        </form>
      </div>
      <div class="memory-actions">
        <button class="icon-btn icon-btn--small" type="button" data-pin="${esc(m.id)}" aria-label="${pinLabel}" title="${pinLabel}">${ICON.star}</button>
        <button class="icon-btn icon-btn--small" type="button" data-edit="${esc(m.id)}" aria-label="Edit memory" title="Edit">${ICON.edit}</button>
        <button class="icon-btn icon-btn--small" type="button" data-delete="${esc(m.id)}" aria-label="Delete memory" title="Delete">${ICON.trash}</button>
      </div>
    </article>`;
}

export async function renderMemories(characterId) {
  const character = await db.getCharacter(characterId);
  if (!character) return notFoundPage('This character no longer exists.');
  const memories = await db.listMemories(characterId);

  const html = `
    ${pageHeader({ eyebrow: character.name, title: 'Memories', back: `#/character/${character.id}` })}
    <p class="muted">Lasting facts about you and your shared history, stored only on this device. For each message, Velora sends the memories that match what you are talking about now, plus any you have pinned, so ${esc(character.name)} can refer back to them. Notes are also written after longer chats. You can edit, pin or delete any memory.</p>

    <form id="memory-form" class="panel stack-tight">
      <label class="field"><span>Add a memory</span>
        <textarea name="text" rows="2" maxlength="200" placeholder="For example: I'm training for a half marathon in May"></textarea>
      </label>
      <label class="field"><span>Type</span>
        <select name="kind">${kindOptions('fact')}</select>
      </label>
      <p class="error" id="memory-error" hidden></p>
      <button class="btn btn--primary" type="submit">${ICON.plus} Save memory</button>
    </form>

    <section class="stack-tight" id="memory-list">
      ${memories.length === 0
        ? emptyState({ title: 'No memories yet', text: 'Add one above, or keep chatting. Notes are written after about two dozen messages.' })
        : memories.slice().reverse().map(memoryItemHTML).join('')}
    </section>

    ${memories.length > 0 ? `
      <section class="panel panel--danger">
        <p class="muted small">${memories.length} ${memories.length === 1 ? 'memory' : 'memories'} for ${esc(character.name)}. Deleting them does not delete chats or the character.</p>
        <button class="btn btn--danger" id="clear-memories" type="button">${ICON.trash} Delete all memories for ${esc(character.name)}</button>
      </section>` : ''}`;

  return {
    html,
    bind(root, { rerender }) {
      const form = root.querySelector('#memory-form');
      const error = root.querySelector('#memory-error');
      const list = root.querySelector('#memory-list');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = form.elements.text.value.trim();
        if (!text) {
          error.textContent = 'Write a short memory first.';
          error.hidden = false;
          return;
        }
        if (suggestsMinor(text)) {
          error.textContent = 'This memory mentions an age or school that suggests someone under 18, so it was not saved.';
          error.hidden = false;
          return;
        }
        if (isDuplicateMemory(text, memories)) {
          error.textContent = 'A memory like this is already saved.';
          error.hidden = false;
          return;
        }
        const now = Date.now();
        await db.saveMemory({
          id: newId(),
          characterId,
          text,
          kind: form.elements.kind.value,
          source: 'user',
          pinned: false,
          createdAt: now,
          updatedAt: now,
        });
        toast('Memory saved.');
        rerender();
      });

      // Buttons on each memory: pin, edit, delete. Clicks are handled here, so new items need no extra setup.
      list.addEventListener('click', async (e) => {
        const item = e.target.closest('.memory-item');
        if (!item) return;
        const id = item.dataset.memory;
        const memory = memories.find((m) => m.id === id);
        if (!memory) return;

        if (e.target.closest('[data-edit]')) {
          item.querySelector('.memory-view').hidden = true;
          item.querySelector('.memory-edit').hidden = false;
          item.querySelector('textarea')?.focus();
          return;
        }
        if (e.target.closest('[data-cancel]')) {
          item.querySelector('.memory-edit').hidden = true;
          item.querySelector('.memory-view').hidden = false;
          return;
        }
        if (e.target.closest('[data-pin]')) {
          await db.saveMemory({ ...memory, pinned: !memory.pinned, updatedAt: Date.now() });
          toast(memory.pinned ? 'Memory unpinned.' : 'Memory pinned. It is always sent with messages.');
          rerender();
          return;
        }
        if (e.target.closest('[data-delete]')) {
          if (!confirmAction('Delete this memory?')) return;
          await db.deleteMemory(id);
          rerender();
        }
      });

      list.addEventListener('submit', async (e) => {
        const editForm = e.target.closest('.memory-edit');
        if (!editForm) return;
        e.preventDefault();
        const item = editForm.closest('.memory-item');
        const memory = memories.find((m) => m.id === item.dataset.memory);
        if (!memory) return;
        const text = editForm.elements.text.value.trim();
        const problem = item.querySelector('[data-edit-error]');
        if (!text) {
          problem.textContent = 'A memory cannot be empty.';
          problem.hidden = false;
          return;
        }
        if (suggestsMinor(text)) {
          problem.textContent = 'This memory mentions an age or school that suggests someone under 18, so it was not saved.';
          problem.hidden = false;
          return;
        }
        await db.saveMemory({
          ...memory,
          text: text.slice(0, 200),
          kind: editForm.elements.kind.value,
          updatedAt: Date.now(),
        });
        toast('Memory updated.');
        rerender();
      });

      root.querySelector('#clear-memories')?.addEventListener('click', async () => {
        if (!confirmAction(`Delete all memories for ${character.name}? This cannot be undone.`)) return;
        const count = await db.deleteMemoriesFor(characterId);
        toast(`Deleted ${count} ${count === 1 ? 'memory' : 'memories'}.`);
        rerender();
      });
    },
  };
}

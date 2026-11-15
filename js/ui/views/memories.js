import * as db from '../../data/db.js';
import { MEMORY_KINDS } from '../../core/config.js';
import { suggestsMinor } from '../../core/safety.js';
import { newId } from '../../core/util.js';
import { esc, pageHeader, notFoundPage, emptyState, toast, confirmAction, ICON } from '../dom.js';

export async function renderMemories(characterId) {
  const character = await db.getCharacter(characterId);
  if (!character) return notFoundPage('This character no longer exists.');
  const memories = await db.listMemories(characterId);

  const kindOptions = Object.entries(MEMORY_KINDS)
    .filter(([key]) => key !== 'summary')
    .map(([key, label]) => `<option value="${key}">${esc(label)}</option>`)
    .join('');

  const html = `
    ${pageHeader({ eyebrow: character.name, title: 'Memories', back: `#/character/${character.id}` })}
    <p class="muted">Lasting facts about you and your shared history. Velora sends a few of these with each message, so ${esc(character.name)} can refer back to them. Notes are also written automatically after longer chats.</p>

    <form id="memory-form" class="panel stack-tight">
      <label class="field"><span>Add a memory</span>
        <textarea name="text" rows="2" maxlength="200" placeholder="For example: I'm training for a half marathon in May"></textarea>
      </label>
      <label class="field"><span>Type</span>
        <select name="kind">${kindOptions}</select>
      </label>
      <p class="error" id="memory-error" hidden></p>
      <button class="btn btn--primary" type="submit">${ICON.plus} Save memory</button>
    </form>

    <section class="stack-tight" id="memory-list">
      ${memories.length === 0
        ? emptyState({ title: 'No memories yet', text: 'Add one above, or keep chatting. Notes are written after about two dozen messages.' })
        : memories.slice().reverse().map((m) => `
          <article class="memory-item">
            <div>
              <span class="tag">${esc(MEMORY_KINDS[m.kind] ?? m.kind)}</span>
              <p>${esc(m.text)}</p>
            </div>
            <button class="icon-btn icon-btn--small" type="button" data-delete="${m.id}" aria-label="Delete memory">${ICON.trash}</button>
          </article>`).join('')}
    </section>`;

  return {
    html,
    bind(root, { rerender }) {
      const form = root.querySelector('#memory-form');
      const error = root.querySelector('#memory-error');

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
        await db.saveMemory({
          id: newId(),
          characterId,
          text,
          kind: form.elements.kind.value,
          createdAt: Date.now(),
        });
        toast('Memory saved.');
        rerender();
      });

      root.querySelector('#memory-list').addEventListener('click', async (e) => {
        const button = e.target.closest('[data-delete]');
        if (!button) return;
        if (!confirmAction('Delete this memory?')) return;
        await db.deleteMemory(button.dataset.delete);
        rerender();
      });
    },
  };
}

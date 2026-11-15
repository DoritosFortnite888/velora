import * as db from '../../data/db.js';
import { AGE_GATE, suggestsMinor } from '../../core/safety.js';
import { newCharacterRecord, DEFAULT_GREETING } from '../../core/characters.js';
import { ROLE_STYLES } from '../../core/config.js';
import { esc, avatarHTML, pageHeader, notFoundPage, toast, ICON } from '../dom.js';
import { imageFileToDataURL } from '../images.js';

const splitLines = (text) => text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const splitTags = (text) => text.split(',').map((s) => s.trim()).filter(Boolean);

function field(name, label, value, { area = false, rows = 3, placeholder = '', max = 2000 } = {}) {
  const input = area
    ? `<textarea name="${name}" rows="${rows}" maxlength="${max}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
    : `<input name="${name}" type="text" value="${esc(value)}" maxlength="${max}" placeholder="${esc(placeholder)}" autocomplete="off">`;
  return `<label class="field"><span>${esc(label)}</span>${input}</label>`;
}

export async function renderEditor(id) {
  const isNew = id === 'new';
  const existing = isNew ? newCharacterRecord() : await db.getCharacter(id);
  if (!existing) return notFoundPage('This character no longer exists.');

  const styleOptions = Object.entries(ROLE_STYLES)
    .map(([key, style]) => `<option value="${key}" ${existing.roleStyle === key ? 'selected' : ''}>${esc(style.label)}</option>`)
    .join('');

  const html = `
    ${pageHeader({
      title: isNew ? 'New character' : `Edit ${existing.name}`,
      back: isNew ? '#/discover' : `#/character/${existing.id}`,
    })}
    <form id="editor" class="stack" novalidate>
      <div class="avatar-picker">
        <div id="avatar-preview">${avatarHTML(existing, 'avatar--xl')}</div>
        <div class="avatar-picker__buttons">
          <label class="btn btn--ghost btn--small">${ICON.upload} Choose picture
            <input id="avatar-input" type="file" accept="image/*" hidden>
          </label>
          <button type="button" class="btn btn--ghost btn--small" id="avatar-remove" ${existing.avatar ? '' : 'disabled'}>Remove</button>
        </div>
      </div>

      ${field('name', 'Name', existing.name, { placeholder: 'Who are they?' })}
      <p class="error" id="name-error" hidden>Give your character a name.</p>
      ${field('tagline', 'One-line description', existing.tagline, { placeholder: 'A night-shift librarian who notices things', max: 120 })}
      ${field('backstory', 'Background', existing.backstory, { area: true, rows: 3, placeholder: 'Who they are, what they do, what they care about' })}
      ${field('personality', 'Personality', existing.personality, { area: true, rows: 2, placeholder: 'Warm, dry humour, curious' })}
      ${field('greeting', 'Opening line', existing.greeting === DEFAULT_GREETING ? '' : existing.greeting, { area: true, rows: 2, placeholder: 'The first thing they say' })}
      ${field('scenario', 'Scenario', existing.scenario, { area: true, rows: 2, placeholder: 'Where you are and what is happening' })}
      ${field('exampleDialogue', 'Example dialogue', existing.exampleDialogue, { area: true, rows: 3, placeholder: '{{user}}: Hi\\n{{char}}: Hello, you made it.' })}

      <label class="field"><span>Roleplay style</span>
        <select name="roleStyle">${styleOptions}</select>
      </label>

      <label class="field"><span>Tags (separated by commas)</span>
        <input name="tags" type="text" value="${esc((existing.tags || []).join(', '))}" placeholder="cozy, mystery" autocomplete="off">
      </label>

      <details class="advanced">
        <summary>Advanced</summary>
        ${field('customInstructions', 'Extra instructions', existing.customInstructions, { area: true, rows: 2, placeholder: 'Anything else the character should keep in mind' })}
        ${field('systemPrompt', 'Main instructions (from card)', existing.systemPrompt, { area: true, rows: 3, max: 4000 })}
        ${field('postHistoryInstructions', 'Reminder sent with each message', existing.postHistoryInstructions, { area: true, rows: 2, max: 1000 })}
        <label class="field"><span>Other openings, one per line</span>
          <textarea name="alternateGreetings" rows="3" maxlength="2000">${esc((existing.alternateGreetings || []).join('\n'))}</textarea>
        </label>
        ${field('creator', 'Creator', existing.creator, { placeholder: 'Who wrote this card?' })}
      </details>

      <p class="note">New characters start unconfirmed. Confirm on the profile page that they are 18 or older before chatting. Velora blocks chat if the text suggests someone under 18.</p>

      <button type="submit" class="btn btn--primary btn--wide">Save character</button>
    </form>`;

  return {
    html,
    bind(root) {
      let avatar = existing.avatar;
      const form = root.querySelector('#editor');
      const preview = root.querySelector('#avatar-preview');

      const refreshPreview = (draftName) => {
        const shown = { ...existing, name: draftName || existing.name, avatar };
        preview.innerHTML = avatarHTML(shown, 'avatar--xl');
        root.querySelector('#avatar-remove').disabled = !avatar;
      };

      root.querySelector('#avatar-input').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
          avatar = await imageFileToDataURL(file);
          refreshPreview(form.elements.name.value);
        } catch (err) {
          toast(err.message, 5000);
        }
      });
      root.querySelector('#avatar-remove').addEventListener('click', () => {
        avatar = null;
        refreshPreview(form.elements.name.value);
      });
      form.elements.name.addEventListener('input', (e) => refreshPreview(e.target.value));

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = form.elements;
        const name = f.name.value.trim();
        const nameError = root.querySelector('#name-error');
        nameError.hidden = !!name;
        if (!name) {
          f.name.focus();
          return;
        }

        const alternates = splitLines(f.alternateGreetings.value);
        const fields = {
          name,
          tagline: f.tagline.value.trim(),
          backstory: f.backstory.value.trim(),
          personality: f.personality.value.trim(),
          greeting: f.greeting.value.trim() || DEFAULT_GREETING,
          scenario: f.scenario.value.trim(),
          exampleDialogue: f.exampleDialogue.value.trim(),
          customInstructions: f.customInstructions.value.trim(),
          systemPrompt: f.systemPrompt.value.trim(),
          postHistoryInstructions: f.postHistoryInstructions.value.trim(),
          alternateGreetings: alternates,
          tags: splitTags(f.tags.value),
          creator: f.creator.value.trim(),
          roleStyle: f.roleStyle.value,
          avatar,
          updatedAt: Date.now(),
        };

        // Re-check the age rules against the new text.
        const combined = [
          fields.name, fields.tagline, fields.backstory, fields.personality, fields.greeting,
          fields.scenario, fields.exampleDialogue, fields.customInstructions,
          fields.systemPrompt, fields.postHistoryInstructions, ...alternates,
        ].join('\n');

        let ageGate = existing.ageGate;
        if (suggestsMinor(combined)) ageGate = AGE_GATE.FLAGGED;
        else if (existing.ageGate === AGE_GATE.FLAGGED) ageGate = AGE_GATE.UNCONFIRMED; // fixed text: confirm again

        const record = { ...existing, ...fields, ageGate, sourceFormat: existing.sourceFormat || 'native' };
        try {
          await db.saveCharacter(record);
        } catch (err) {
          toast(err.message, 6000);
          return;
        }
        toast(isNew ? `${name} was created.` : 'Changes saved.');
        location.hash = `#/character/${record.id}`;
      });
    },
  };
}

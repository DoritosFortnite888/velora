import * as db from '../../data/db.js';
import { AGE_GATE, suggestsMinor } from '../../core/safety.js';
import { newCharacterRecord, DEFAULT_GREETING } from '../../core/characters.js';
import { ROLE_STYLES, PERSONALITY_TRAITS, LENGTHS, MAX_CUSTOM_PERSONALITY_CHARS } from '../../core/config.js';
import { contentMode, ADULT_MIN_AGE } from '../../core/persona.js';
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

function select(name, label, options, current) {
  const items = Object.entries(options)
    .map(([key, option]) => `<option value="${key}" ${current === key ? 'selected' : ''}>${esc(option.label)}</option>`)
    .join('');
  return `<label class="field"><span>${esc(label)}</span><select name="${name}">${items}</select></label>`;
}

export async function renderEditor(id) {
  const isNew = id === 'new';
  const existing = isNew ? newCharacterRecord() : await db.getCharacter(id);
  if (!existing) return notFoundPage('This character no longer exists.');

  const traits = new Set(existing.personalityTraits || []);
  const traitChips = Object.entries(PERSONALITY_TRAITS)
    .map(([key, trait]) => `
      <input type="checkbox" id="trait-${key}" name="trait" value="${key}" ${traits.has(key) ? 'checked' : ''}>
      <label for="trait-${key}">${esc(trait.label)}</label>`)
    .join('');

  const intensity = Number.isFinite(existing.romanceIntensity) ? existing.romanceIntensity : 30;

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
      ${field('greeting', 'Opening line', existing.greeting === DEFAULT_GREETING ? '' : existing.greeting, { area: true, rows: 2, placeholder: 'The first thing they say' })}
      ${field('scenario', 'Scenario', existing.scenario, { area: true, rows: 2, placeholder: 'Where you are and what is happening' })}
      ${field('exampleDialogue', 'Example dialogue', existing.exampleDialogue, { area: true, rows: 3, placeholder: '{{user}}: Hi\\n{{char}}: Hello, you made it.' })}

      <section class="panel stack-tight">
        <h2>Personality</h2>
        <div class="field"><span>Traits (pick any that fit)</span>
          <div class="trait-grid">${traitChips}</div>
        </div>
        ${field('customPersonality', 'Custom personality', existing.customPersonality, { area: true, rows: 2, max: MAX_CUSTOM_PERSONALITY_CHARS, placeholder: 'For example: dry humour, hates small talk, secretly sentimental' })}
        ${field('personality', 'Personality notes', existing.personality, { area: true, rows: 2, placeholder: 'Warm, curious, a little guarded' })}
        ${select('roleStyle', 'Narration', ROLE_STYLES, existing.roleStyle)}
        ${select('replyLength', 'Reply length', LENGTHS, existing.replyLength || 'short')}
        <p class="field-help">Short is the default: 1 to 4 sentences. Asking for detail in a message gives a longer reply.</p>
      </section>

      <section class="panel stack-tight">
        <h2>Age and romance</h2>
        <label class="field"><span>Character's age</span>
          <input name="statedAge" type="number" inputmode="numeric" min="1" max="120" value="${existing.statedAge ?? ''}" placeholder="For example 29" autocomplete="off">
        </label>
        <p class="field-help">Romance needs an age of ${ADULT_MIN_AGE} or more, and the character confirmed as an adult. Without an age, romance stays off.</p>
        <label class="field"><span>Romance level</span>
          <div class="slider-row">
            <input name="romanceIntensity" type="range" min="0" max="100" step="5" value="${intensity}" aria-describedby="intensity-help">
            <output id="intensity-out">${esc(intensityLabel(intensity))}</output>
          </div>
        </label>
        <p class="field-help" id="intensity-help">Adjusts how warm and romantic the character's tone is. Only used by confirmed adults with an age of ${ADULT_MIN_AGE} or more. It never allows sexual content.</p>
        <p class="field-help" id="age-status"></p>
      </section>

      <details class="advanced">
        <summary>Advanced</summary>
        ${field('customInstructions', 'Extra instructions', existing.customInstructions, { area: true, rows: 2, placeholder: 'Anything else the character should keep in mind' })}
        ${field('systemPrompt', 'Main instructions (from card)', existing.systemPrompt, { area: true, rows: 3, max: 4000 })}
        ${field('postHistoryInstructions', 'Reminder sent with each message', existing.postHistoryInstructions, { area: true, rows: 2, max: 1000 })}
        <label class="field"><span>Other openings, one per line</span>
          <textarea name="alternateGreetings" rows="3" maxlength="2000">${esc((existing.alternateGreetings || []).join('\n'))}</textarea>
        </label>
        ${field('tags', 'Tags (separated by commas)', (existing.tags || []).join(', '), { placeholder: 'cozy, mystery' })}
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
      const slider = form.elements.romanceIntensity;
      const ageStatus = root.querySelector('#age-status');

      const refreshAgeStatus = () => {
        const age = form.elements.statedAge.value.trim();
        const probe = {
          ...existing,
          ageGate: existing.ageGate === AGE_GATE.FLAGGED ? AGE_GATE.UNCONFIRMED : existing.ageGate,
          statedAge: age === '' ? null : Number(age),
          romanceIntensity: Number(slider.value),
        };
        const mode = contentMode(probe);
        ageStatus.textContent = mode.mode === 'adult'
          ? `Romance is available at the "${mode.level.label}" level once the character is confirmed as an adult.`
          : mode.reason === 'off'
            ? 'Romance is off because the level is set to Off.'
            : 'Romance is off until an age of 18 or more is entered and the character is confirmed as an adult.';
      };
      slider.addEventListener('input', () => {
        root.querySelector('#intensity-out').textContent = intensityLabel(Number(slider.value));
        refreshAgeStatus();
      });
      form.elements.statedAge.addEventListener('input', refreshAgeStatus);
      refreshAgeStatus();

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

        const ageText = f.statedAge.value.trim();
        let statedAge = null;
        if (ageText !== '') {
          const parsed = Number(ageText);
          if (!Number.isInteger(parsed) || parsed < 1 || parsed > 120) {
            toast('Enter the age as a whole number from 1 to 120, or leave it empty.', 5000);
            f.statedAge.focus();
            return;
          }
          statedAge = parsed;
        }

        const alternates = splitLines(f.alternateGreetings.value);
        const selectedTraits = [...form.querySelectorAll('input[name="trait"]:checked')].map((box) => box.value);
        const fields = {
          name,
          tagline: f.tagline.value.trim(),
          backstory: f.backstory.value.trim(),
          personality: f.personality.value.trim(),
          personalityTraits: selectedTraits,
          customPersonality: f.customPersonality.value.trim().slice(0, MAX_CUSTOM_PERSONALITY_CHARS),
          roleStyle: f.roleStyle.value,
          replyLength: f.replyLength.value,
          romanceIntensity: Number(f.romanceIntensity.value),
          statedAge,
          greeting: f.greeting.value.trim() || DEFAULT_GREETING,
          scenario: f.scenario.value.trim(),
          exampleDialogue: f.exampleDialogue.value.trim(),
          customInstructions: f.customInstructions.value.trim(),
          systemPrompt: f.systemPrompt.value.trim(),
          postHistoryInstructions: f.postHistoryInstructions.value.trim(),
          alternateGreetings: alternates,
          tags: splitTags(f.tags.value),
          creator: f.creator.value.trim(),
          avatar,
          updatedAt: Date.now(),
        };

        // Re-check the age rules against the new text and the stated age.
        const combined = [
          fields.name, fields.tagline, fields.backstory, fields.personality, fields.greeting,
          fields.scenario, fields.exampleDialogue, fields.customInstructions, fields.customPersonality,
          fields.systemPrompt, fields.postHistoryInstructions, ...alternates,
        ].join('\n');

        let ageGate = existing.ageGate;
        if ((statedAge !== null && statedAge < ADULT_MIN_AGE) || suggestsMinor(combined)) {
          ageGate = AGE_GATE.FLAGGED;
        } else if (existing.ageGate === AGE_GATE.FLAGGED) {
          ageGate = AGE_GATE.UNCONFIRMED; // text was fixed: confirm again
        }

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

function intensityLabel(value) {
  // Mirrors the levels in js/core/persona.js, so the label shown matches the prompt.
  if (value <= 0) return 'Off';
  if (value < 25) return 'Light';
  if (value < 60) return 'Romantic';
  return 'Intense';
}

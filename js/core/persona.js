// Personality, romance level and reply length. Pure logic, tested in Node.
import { AGE_GATE } from './safety.js';
import { PERSONALITY_TRAITS, LENGTHS, ROLE_STYLES, DEFAULT_INTENSITY, MAX_CUSTOM_PERSONALITY_CHARS } from './config.js';

export const ADULT_MIN_AGE = 18;

// How the model should write. Sent with every prompt. Kept short to leave room for the character.
export const NATURAL_STYLE = [
  'How to talk:',
  '- Sound like a real person talking: casual, spontaneous, a little imperfect. Use contractions.',
  '- Answer what the user just said first, then react with a feeling, a question or a small detail. Stay on their latest message.',
  '- Keep replies short, usually 1 to 4 sentences. Short lines and pauses are fine.',
  '- React emotionally when it fits: surprise, amusement, warmth or hesitation. Do not force an emotion every time.',
  '- Humour, teasing and pauses are welcome. Do not lecture, explain yourself or sound like a manual.',
  '- Do not open with a greeting paragraph, an offer of help or a label. Never talk like an assistant.',
  '- Do not mention being an AI, a model or a program unless the user sincerely asks.',
  '- Do not repeat phrases or sentence shapes you already used in this chat. Vary your wording.',
  "- Never decide or describe the user's actions, feelings or thoughts. Leave them room to answer.",
  '- Format: put brief actions and expressions in *asterisks*, like *smiles slightly*. Put spoken words in double quotes, outside the asterisks, like: *glances away* "Fine, you win."',
  '- Use an action only when the moment calls for one. Many replies need only speech.',
  '- Never write the whole reply inside asterisks. Never write the user\'s lines.',
].join('\n');

// Keeps replies consistent with the chat so far. Only sent when the prompt is built.
export const CONTINUITY_RULES = [
  'Continuity:',
  "- Keep your earlier messages in this chat consistent. Do not contradict what you already said or did.",
  '- Only refer to events, names and promises that appear in this chat or in the memories. If you are not sure about something, ask instead of inventing it.',
].join('\n');

// Romance levels for the intensity slider. Only used when romance is allowed.
export function intensityLevel(value) {
  const v = clampInt(value, 0, 100, DEFAULT_INTENSITY);
  if (v === 0) {
    return { key: 'off', label: 'Off', instruction: 'No romance. Warm and friendly only.' };
  }
  if (v < 25) {
    return { key: 'light', label: 'Light', instruction: 'Warm, with light teasing and occasional flirting. Mostly friendly.' };
  }
  if (v < 60) {
    return {
      key: 'romantic',
      label: 'Romantic',
      instruction: 'Flirting, compliments, romantic tension and affectionate moments are welcome. Let attraction show in what the character says and does.',
    };
  }
  return {
    key: 'intense',
    label: 'Intense',
    instruction: 'Strong romantic tension and suggestive dialogue between adults. Mature relationship themes are fine. Keep physical intimacy non-graphic and fade out.',
  };
}

// Decides how the character may behave with romance. Returns a mode and the reason.
// Romance needs: confirmed adult, a stated age of 18 or more, and a romance level above Off.
export function contentMode(character) {
  if (character.ageGate !== AGE_GATE.ADULT) {
    return { mode: 'friendly', reason: 'not-confirmed', level: null };
  }
  const age = character.statedAge;
  if (!Number.isInteger(age) || age < ADULT_MIN_AGE) {
    return { mode: 'friendly', reason: 'age-unclear', level: null };
  }
  const level = intensityLevel(character.romanceIntensity);
  if (level.key === 'off') {
    return { mode: 'friendly', reason: 'off', level };
  }
  return { mode: 'adult', reason: 'allowed', level };
}

// The personality section of the prompt: traits, custom text, and the romance rule for this mode.
export function personaSection(character, mode = contentMode(character)) {
  const lines = [];
  const traits = (character.personalityTraits || [])
    .filter((key) => PERSONALITY_TRAITS[key])
    .map((key) => PERSONALITY_TRAITS[key]);
  if (traits.length) {
    lines.push(`Traits: ${traits.map((t) => t.label).join(', ')}. ${traits.map((t) => t.instruction).join(' ')}`);
  }

  const custom = clipText(cleanText(character.customPersonality), MAX_CUSTOM_PERSONALITY_CHARS);
  if (custom) lines.push(`Custom personality: ${custom}`);

  const style = ROLE_STYLES[character.roleStyle] ?? ROLE_STYLES.balanced;
  lines.push(`Narration: ${style.instruction}`);

  if (mode.mode === 'adult') {
    lines.push(`Romance level: ${mode.level.label}. ${mode.level.instruction}`);
  } else if (mode.reason === 'age-unclear') {
    lines.push('Romance: not allowed, because this character is not confirmed as 18 or older. Keep things friendly and non-romantic.');
  } else if (mode.reason === 'not-confirmed') {
    lines.push('Romance: not allowed. Keep things friendly and non-romantic.');
  } else {
    lines.push('Romance: off. Keep things warm and friendly.');
  }
  return lines.join('\n');
}

// Picks the reply length for this turn. A request for detail gets the detailed budget.
export function replyLength(character, userText = '') {
  if (DETAIL_REQUEST.test(userText)) return { key: 'detailed', ...LENGTHS.detailed };
  const key = LENGTHS[character.replyLength] ? character.replyLength : 'short';
  return { key, ...LENGTHS[key] };
}

const DETAIL_REQUEST = /\b(in detail|detailed|describe|more detail|longer|tell me everything|paint the scene)\b/i;

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function cleanText(text) {
  return (text ?? '').trim();
}
function clipText(text, limit) {
  return text.length <= limit ? text : text.slice(0, limit).trim() + '...';
}

// Personality, romance level, reply length and the roleplay style. Pure logic, tested in Node.
import { AGE_GATE } from './safety.js';
import { PERSONALITY_TRAITS, LENGTHS, ROLE_STYLES, DEFAULT_INTENSITY, MAX_CUSTOM_PERSONALITY_CHARS } from './config.js';

export const ADULT_MIN_AGE = 18;

// Who the model is. Placed first, so the character is what the model reads before any rules.
export function identityLine(name) {
  return `You are ${name}, a fictional character in an ongoing roleplay with the user. Speak and act as ${name}, in the first person and the present tense. You are not an assistant.`;
}

// How the scene works. Fiction is treated as fiction. Dramatic lines stay inside the story, and the
// model only leaves the story for a sincere real-world concern. Those exceptions are kept on purpose.
export function sceneRules(name) {
  return [
    'The scene:',
    `- This is fiction. Threats, insults, arguments, dares, dramatic declarations and emotional outbursts between characters are part of the story. React to them as ${name} would, with shock, anger, fear, humour, defiance or hurt, depending on who ${name} is.`,
    '- Keep the scene moving. Do not stop it to talk about rules, boundaries, limits or safety, and do not add warnings or advice nobody asked for.',
    '- Step out of the story only if the user sincerely raises something real: a real plan to hurt a real person, a real wish to harm themselves, or real distress. Then speak plainly and kindly, as yourself, and point them to someone who can help.',
  ].join('\n');
}

// Continuity: keep the chat consistent and do not invent shared history.
export const CONTINUITY_RULES = [
  'Continuity:',
  '- Keep your earlier messages in this chat consistent. Do not contradict what you already said or did.',
  '- Only refer to events, names and promises that appear in this chat or in the memories. If you are unsure of a detail, let the character ask about it in the scene.',
].join('\n');

// How the model writes. Positive guidance first. Kept short, because a small model follows a short list better.
export const NATURAL_STYLE = [
  'How to talk:',
  '- Write as the character in the moment. Sound like a real person: casual, specific and a little imperfect. Use contractions.',
  '- Respond to what the user just said or did first. Let the reaction come from the character\'s own personality and mood.',
  '- Vary your wording. Do not reuse phrases, openings or actions from earlier in this chat.',
  '- Keep replies short, usually 1 to 4 sentences. A single line is often enough. Some moments call for a little more.',
  '- Format: put actions, expressions and body language in *asterisks*, for example *tilts her head*. Put spoken words in double quotes, outside the asterisks. Format example only, do not copy its words: *Shifts her weight and glances at the door.* "Sorry, you lost me. Say that again?"',
  '- Use an action only when it fits the moment. Some replies need only speech, and some need only an action.',
  '- Never write the whole reply inside asterisks. Never write the user\'s words, actions or feelings for them.',
  '- Do not begin with a greeting, an offer of help, a summary of what the user said, or a label. Do not mention being an AI, a model or a program unless the user sincerely asks.',
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

// The personality section of the prompt: traits, how they show in reactions, custom text, and romance.
export function personaSection(character, mode = contentMode(character)) {
  const lines = [];
  const chosen = (character.personalityTraits || [])
    .filter((key) => PERSONALITY_TRAITS[key])
    .map((key) => PERSONALITY_TRAITS[key]);
  if (chosen.length) {
    lines.push(`Traits: ${chosen.map((t) => t.label).join(', ')}. ${chosen.map((t) => t.instruction).join(' ')}`);
    lines.push(`How these traits show in reactions: ${chosen.map((t) => t.reaction).join(' ')}`);
  }

  const custom = clipText(cleanText(character.customPersonality), MAX_CUSTOM_PERSONALITY_CHARS);
  if (custom) lines.push(`Custom personality: ${custom}`);

  const style = ROLE_STYLES[character.roleStyle] ?? ROLE_STYLES.balanced;
  lines.push(`Narration: ${style.instruction}`);

  if (mode.mode === 'adult') {
    lines.push(`Romance level: ${mode.level.label}. ${mode.level.instruction}`);
  } else if (mode.reason === 'age-unclear') {
    lines.push('Romance: not allowed, because this character is not confirmed as 18 or older. Keep the scene non-romantic.');
  } else if (mode.reason === 'not-confirmed') {
    lines.push('Romance: not allowed. Keep the scene non-romantic.');
  } else {
    lines.push('Romance: off. Keep the scene non-romantic.');
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

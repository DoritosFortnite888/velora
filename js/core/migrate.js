// Upgrades characters saved by earlier versions of Velora. Safe to run more than once.
import { DEFAULT_INTENSITY, LENGTHS, ROLE_STYLES } from './config.js';
import { AGE_GATE } from './safety.js';

// Ages of the built-in fictional characters. These are the only ages Velora sets for you.
export const FICTIONAL_AGES = {
  Mira: 29, Kai: 31, Nova: 27,
  'Elena Marsh': 29, 'Jonah Reyes': 34, 'Dana Cole': 33, 'Captain Lyra Voss': 37,
  'Theo Hart': 31, 'Sir Aldric of Vale': 45, 'Rowan Blake': 42, 'Sam Okafor': 30,
};

const TRAITS = ['shy', 'confident', 'playful', 'flirty', 'romantic', 'sarcastic', 'dominant', 'gentle'];

// Returns the upgraded record and whether anything changed.
export function upgradeCharacter(record) {
  const next = { ...record };
  let changed = false;
  const set = (key, value) => {
    if (JSON.stringify(next[key]) !== JSON.stringify(value)) {
      next[key] = value;
      changed = true;
    }
  };

  // Narration styles used to include "playful" and "gentle". Those are now personality traits.
  const oldStyle = record.roleStyle;
  if (!ROLE_STYLES[oldStyle]) set('roleStyle', 'balanced');
  if (!Array.isArray(record.personalityTraits)) {
    const traits = TRAITS.filter((t) => t === oldStyle);
    set('personalityTraits', traits);
  }
  if (typeof record.customPersonality !== 'string') set('customPersonality', '');
  if (typeof record.romanceIntensity !== 'number') set('romanceIntensity', DEFAULT_INTENSITY);
  if (!LENGTHS[record.replyLength]) set('replyLength', 'short');

  // The stated age is only filled in for built-in fictional characters. Everyone else adds their own.
  if (record.statedAge === undefined) {
    const known = (record.sourceFormat === 'starter' || record.sourceFormat === 'example')
      ? FICTIONAL_AGES[record.name]
      : undefined;
    set('statedAge', Number.isInteger(known) ? known : null);
  }

  // An adult-confirmed character with no clear age keeps its gate, but romance stays off until an age is added.
  if (record.ageGate !== AGE_GATE.ADULT && record.ageGate !== AGE_GATE.UNCONFIRMED && record.ageGate !== AGE_GATE.FLAGGED) {
    set('ageGate', AGE_GATE.UNCONFIRMED);
  }
  return { record: next, changed };
}

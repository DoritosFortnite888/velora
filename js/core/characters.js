// Character records. Every character is a plain object stored in IndexedDB.
import { newId } from './util.js';
import { AGE_GATE } from './safety.js';
import { DEFAULT_INTENSITY } from './config.js';

export const DEFAULT_GREETING = "Hi there. What's on your mind?";

// A new character record with defaults. Fields passed in override the defaults.
export function newCharacterRecord(fields = {}) {
  const now = Date.now();
  return {
    id: newId(),
    name: '',
    tagline: '',
    personality: '',
    backstory: '',
    greeting: DEFAULT_GREETING,
    customInstructions: '',
    avatar: null,            // data URL of a picture, or null
    scenario: '',
    exampleDialogue: '',
    systemPrompt: '',        // main instructions (from cards or the advanced section)
    postHistoryInstructions: '',
    alternateGreetings: [],
    tags: [],
    creator: '',
    sourceFormat: 'native',  // native, example, card-v1, card-v2, png-card-v2, pasted ...
    ageGate: AGE_GATE.UNCONFIRMED,
    roleStyle: 'balanced',          // narration: balanced, dramatic (Vivid), direct (Minimal)
    personalityTraits: [],          // e.g. ['shy', 'playful']
    customPersonality: '',
    romanceIntensity: DEFAULT_INTENSITY,  // 0 (off) to 100; only used for confirmed adults
    replyLength: 'short',           // short, medium or detailed
    statedAge: null,                // the character's age. Romance needs 18 or more
    isFavourite: false,
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

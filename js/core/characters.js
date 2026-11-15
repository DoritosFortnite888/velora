// Character records. Every character is a plain object stored in IndexedDB.
import { newId } from './util.js';
import { AGE_GATE } from './safety.js';

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
    roleStyle: 'balanced',
    isFavourite: false,
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

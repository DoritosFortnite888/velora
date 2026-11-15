// Velora settings. Change values here; the rest of the app reads them from this file.

export const APP_NAME = 'Velora';
export const APP_VERSION = '1.1.0';

// The on-device AI library (WebLLM). It is loaded from a public CDN at this exact version,
// so an update cannot change behaviour without you noticing. If the library stops loading,
// check the latest version on npm (search "@mlc-ai/web-llm") and update WEBLLM_VERSION.
export const WEBLLM_VERSION = '0.2.79';
export const WEBLLM_URL = `https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@${WEBLLM_VERSION}/+esm`;

// Models the app can download. The ids below must exist in the WebLLM prebuilt list.
// The app checks this before downloading and explains the problem if one is missing.
// Every model has its own training and limits. A small model may ignore roleplay rules.
export const MODELS = [
  {
    id: 'qwen2.5-0.5b',
    displayName: 'Qwen2.5 0.5B Instruct',
    summary: 'Small and quick, so it is the default for phones. Replies are simpler than larger models, and it sometimes ignores style guidance.',
    license: 'Apache 2.0',
    contextWindow: 4096,
    // Used when the GPU supports 16-bit shaders: smaller download and faster.
    webllmIdF16: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    // Used when it does not: larger download, works on more GPUs.
    webllmIdF32: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
  },
];

export const DEFAULT_MODEL_ID = 'qwen2.5-0.5b';

// Limits that keep prompts inside the model's context window.
export const LIMITS = {
  replyTokens: 420,          // the most a reply may take (space reserved in the prompt)
  summaryTokens: 200,        // longest memory summary the model may write
  summaryThreshold: 24,      // new messages before memory notes are written
  summaryTranscript: 40,     // most recent messages read when writing memory notes
  maxHistoryMessages: 16,    // most recent messages sent in a prompt
  maxMemories: 12,           // most memories sent in a prompt
};

// How long replies are. Short is the default: 1 to 4 sentences.
// A reply is allowed more room when the user asks for detail (see persona.js).
export const LENGTHS = {
  short: {
    label: 'Short',
    maxTokens: 180,
    guide: 'Reply in 1 to 4 short sentences. Keep it conversational.',
  },
  medium: {
    label: 'Medium',
    maxTokens: 280,
    guide: 'Reply in 2 to 6 sentences. Add detail only where it helps the moment.',
  },
  detailed: {
    label: 'Detailed',
    maxTokens: 420,
    guide: 'The user asked for detail, so you may describe the scene a little more, in no more than two short paragraphs.',
  },
};

// Personality traits the user can switch on. Each one is added to the character's prompt.
export const PERSONALITY_TRAITS = {
  shy: { label: 'Shy', instruction: 'Shy and a little hesitant. Pauses, trails off, opens up slowly.' },
  confident: { label: 'Confident', instruction: 'Confident and self-assured. Speaks with a relaxed certainty.' },
  playful: { label: 'Playful', instruction: 'Playful and mischievous. Teases, jokes and gets a bit silly.' },
  flirty: { label: 'Flirty', instruction: 'Flirty. Light compliments and lingering looks, within the romance level.' },
  romantic: { label: 'Romantic', instruction: 'Romantic and sentimental. Notices small details and speaks warmly about feelings.' },
  sarcastic: { label: 'Sarcastic', instruction: 'Sarcastic and dry. Deadpan remarks and mock exasperation, never cruel to the user.' },
  dominant: { label: 'Dominant', instruction: 'Dominant and directive. Takes charge of the scene and makes decisions, but always respects the user\'s choices and their no.' },
  gentle: { label: 'Gentle', instruction: 'Gentle and patient. Soft tone, reassuring, leaves room for the user to lead.' },
};

// Narration style: how much the character describes their own actions.
export const ROLE_STYLES = {
  balanced: { label: 'Balanced', instruction: 'Mostly dialogue, with a few short actions.' },
  dramatic: { label: 'Vivid', instruction: 'Use a few more sensory actions and let the scene build.' },
  direct: { label: 'Minimal', instruction: 'Keep actions minimal. Let your words carry the scene.' },
};

// Romance levels, from the intensity slider (0 to 100). Only used for confirmed adults with a stated age of 18+.
export const DEFAULT_INTENSITY = 30;

export const MAX_CUSTOM_PERSONALITY_CHARS = 300;

export const MEMORY_KINDS = {
  fact: 'Fact about you',
  event: 'Shared event',
  promise: 'Promise',
  summary: 'Written from chat',
};

// Device checks. These are heuristics based on what browsers expose. They are not guarantees.
export const DEVICE = {
  minMaxBufferMB: 256,        // the GPU must allow buffers of at least this size
  minStorageBindingMB: 128,   // and storage bindings of at least this size
  minDeviceMemoryGB: 2,       // only checked where the browser reports RAM (Safari does not)
  storageNeededMB: 800,       // rough space the model needs; only a warning
};

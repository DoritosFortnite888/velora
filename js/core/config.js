// Velora settings. Change values here; the rest of the app reads them from this file.

export const APP_NAME = 'Velora';
export const APP_VERSION = '1.3.0';

// The on-device AI library (WebLLM). It is loaded from a public CDN at this exact version,
// so an update cannot change behaviour without you noticing. If the library stops loading,
// check the latest version on npm (search "@mlc-ai/web-llm") and update WEBLLM_VERSION.
export const WEBLLM_VERSION = '0.2.79';
export const WEBLLM_URL = `https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@${WEBLLM_VERSION}/+esm`;

// Models the app can offer. Choosing a model does NOT download it. A download only starts when the
// user taps Download on the Models page and confirms the size. Only one download can run at a time.
//
// Figures marked "estimate" come from third-party reports or from WebLLM's own memory figure
// (vramMB). They are not measured by this project. Check the model card on Hugging Face before a
// large download. Every model here is untested on a real iPhone 14 unless the note says otherwise.
//
// The ids must exist in the WebLLM prebuilt list. The app checks this before a download and explains
// the problem if one is missing.
export const MODELS = [
  {
    id: 'qwen2.5-0.5b',
    displayName: 'Qwen2.5 0.5B Instruct',
    tier: 'Fallback',
    summary: 'Small and quick. The safest choice for an older phone, and the default so existing installs keep working. Replies are simple, and it often drifts from the scene or forgets earlier details.',
    intelligence: 'Basic. Short, simple replies. Repeats itself more often.',
    speed: 'Fastest of the choices.',
    downloadMB: 300,            // estimate
    vramMB: null,               // not published in the figures checked
    sizeNote: 'Smaller download (about 300 MB, estimate).',
    license: 'Apache 2.0',
    contextWindow: 4096,
    webllmIdF16: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    webllmIdF32: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
  },
  {
    id: 'llama-3.2-1b',
    displayName: 'Llama 3.2 1B Instruct',
    tier: 'Recommended for iPhone 14',
    summary: 'The best balance this project found for an iPhone 14. It follows a character and the recent chat better than the 0.5B model, and its WebLLM memory figure is the lowest of the larger models. It has not been run on an iPhone 14 by this project yet.',
    intelligence: 'Good for short roleplay. Follows the chat and character more reliably than 0.5B, but it is still a small model.',
    speed: 'Quick. Not yet measured on iPhone 14.',
    downloadMB: 900,           // estimate
    vramMB: 879,               // WebLLM's own figure for the f16 build
    sizeNote: 'About 900 MB (estimate). Use Wi-Fi.',
    license: 'Llama 3.2 Community License (Meta)',
    contextWindow: 4096,
    webllmIdF16: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    webllmIdF32: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
    recommended: true,
    untested: true,
  },
  {
    id: 'qwen2.5-1.5b',
    displayName: 'Qwen2.5 1.5B Instruct',
    tier: 'Larger, may not run on iPhone',
    summary: 'Larger, so it can follow the conversation more closely. It needs more memory than the 1B model. One third-party iPhone report found it failed to load after downloading.',
    intelligence: 'Better than 1B on some languages and reasoning. Roleplay quality is similar to Llama 3.2 1B.',
    speed: 'Slower than the 1B model.',
    downloadMB: 1000,          // estimate
    vramMB: null,
    sizeNote: 'Large download, about 1 GB (estimate). Use Wi-Fi.',
    license: 'Apache 2.0',
    contextWindow: 4096,
    webllmIdF16: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    webllmIdF32: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC',
    untested: true,
  },
  {
    id: 'llama-3.2-3b',
    displayName: 'Llama 3.2 3B Instruct',
    tier: 'Strongest, experimental',
    summary: 'The strongest model in this list for natural, long roleplay. Its WebLLM memory figure is about 2.3 GB, which is more than an iPhone 14 Safari tab is likely to allow. Expect failures, page reloads, or a very slow reply. Use the 1B model on an iPhone 14.',
    intelligence: 'Best conversation and memory of the choices here, if it runs.',
    speed: 'Slowest. Likely too slow or too large for an iPhone 14.',
    downloadMB: 1800,          // estimate
    vramMB: 2264,              // WebLLM's own figure for the f16 build
    sizeNote: 'Very large download, about 1.8 GB (estimate). Use Wi-Fi and enough free storage.',
    license: 'Llama 3.2 Community License (Meta)',
    contextWindow: 4096,
    webllmIdF16: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    webllmIdF32: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
    untested: true,
    highMemory: true,
  },
];

export const DEFAULT_MODEL_ID = 'qwen2.5-0.5b';

// Limits that keep prompts inside the model's context window.
export const LIMITS = {
  replyTokens: 420,          // the most a reply may take (space reserved in the prompt)
  summaryTokens: 200,        // longest memory summary the model may write
  summaryThreshold: 24,      // new messages before memory notes are written
  summaryTranscript: 40,     // most recent messages read when writing memory notes
  maxHistoryMessages: 20,    // most recent messages considered for a prompt (the newest always kept)
  maxMemories: 12,           // most memories sent in a prompt
  memoryChars: 700,          // total characters of memories sent in a prompt
  rollingSummaryTokens: 180, // longest summary of older messages the model may write
  rollingSummaryBatch: 8,    // messages that must fall out of the prompt window before a summary update
  rollingSummaryChunk: 30,   // most messages read in one summary update
};

// Settings for generating a reply. They favour coherence over variety, and the penalties discourage
// the repeated phrases small models fall into. Not every model runtime supports every setting.
export const INFERENCE = {
  temperature: 0.8,
  topP: 0.92,
  frequencyPenalty: 0.4,
  presencePenalty: 0.2,
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

// Kinds of memory. Older memories keep their kind; new kinds are added without changing old data.
export const MEMORY_KINDS = {
  fact: 'Fact about you',
  preference: 'Preference',
  relationship: 'Relationship',
  event: 'Shared event',
  promise: 'Promise',
  ongoing: 'Ongoing situation',
  character: 'About the character',
  summary: 'Written from chat',
};

// When choosing which memories to show, some kinds count for more than others.
export const MEMORY_KIND_WEIGHT = {
  fact: 1.5,
  preference: 1.2,
  relationship: 1.5,
  event: 1,
  promise: 2,
  ongoing: 1.5,
  character: 1.5,
  summary: 1,
};

// Device checks. These are heuristics based on what browsers expose. They are not guarantees.
export const DEVICE = {
  minMaxBufferMB: 256,        // the GPU must allow buffers of at least this size
  minStorageBindingMB: 128,   // and storage bindings of at least this size
  minDeviceMemoryGB: 2,       // only checked where the browser reports RAM (Safari does not)
  storageNeededMB: 800,       // rough space the model needs; only a warning
};

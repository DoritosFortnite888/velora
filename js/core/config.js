// Velora settings. Change values here; the rest of the app reads them from this file.

export const APP_NAME = 'Velora';
export const APP_VERSION = '1.0.0';

// The on-device AI library (WebLLM). It is loaded from a public CDN at this exact version,
// so an update cannot change behaviour without you noticing. If the library stops loading,
// check the latest version on npm (search "@mlc-ai/web-llm") and update WEBLLM_VERSION.
export const WEBLLM_VERSION = '0.2.79';
export const WEBLLM_URL = `https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@${WEBLLM_VERSION}/+esm`;

// Models the app can download. The ids below must exist in the WebLLM prebuilt list.
// The app checks this before downloading and explains the problem if one is missing.
export const MODELS = [
  {
    id: 'qwen2.5-0.5b',
    displayName: 'Qwen2.5 0.5B Instruct',
    summary: 'Small and quick, so it is the default for phones. Replies are simpler than larger models.',
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
  replyTokens: 400,          // longest reply the model may write
  summaryTokens: 200,        // longest memory summary the model may write
  summaryThreshold: 24,      // new messages before memory notes are written
  summaryTranscript: 40,     // most recent messages read when writing memory notes
  maxHistoryMessages: 16,    // most recent messages sent in a prompt
  maxMemories: 12,           // most memories sent in a prompt
};

// Device checks. These are heuristics based on what browsers expose. They are not guarantees.
export const DEVICE = {
  minMaxBufferMB: 256,        // the GPU must allow buffers of at least this size
  minStorageBindingMB: 128,   // and storage bindings of at least this size
  minDeviceMemoryGB: 2,       // only checked where the browser reports RAM (Safari does not)
  storageNeededMB: 800,       // rough space the model needs; only a warning
};

// Roleplay personalities. The chosen one is added to the character's prompt.
// Safety rules are always added after it, so no style can switch them off.
export const ROLE_STYLES = {
  balanced: { label: 'Balanced', instruction: 'Mix dialogue and action in a natural way.' },
  playful: { label: 'Playful', instruction: 'Be witty and playful. Tease lightly and keep the energy up.' },
  gentle: { label: 'Gentle', instruction: 'Be calm, warm and patient. Leave room for the user to lead.' },
  dramatic: { label: 'Dramatic', instruction: 'Lean into vivid description, tension and emotion. Let scenes build.' },
  direct: { label: 'Direct', instruction: 'Be concise and straightforward. Ask one clear question at a time.' },
};

export const MEMORY_KINDS = {
  fact: 'Fact about you',
  event: 'Shared event',
  promise: 'Promise',
  summary: 'Written from chat',
};

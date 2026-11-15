// The on-device AI engine: a thin wrapper around WebLLM (MLC, Apache 2.0).
// WebLLM runs the model on the GPU through WebGPU. Model files are downloaded once from the
// model host, then cached in the browser. Conversations are never sent to any server.
import { WEBLLM_URL, WEBLLM_VERSION } from '../core/config.js';

export class EngineError extends Error {}

let library = null;
let libraryPromise = null;
let engine = null;
let engineModelId = null;
let loadingPromise = null;
let loadingModelId = null;

export async function loadLibrary() {
  if (library) return library;
  if (!libraryPromise) {
    libraryPromise = import(/* @vite-ignore */ WEBLLM_URL)
      .then((module) => {
        library = module;
        return module;
      })
      .catch((err) => {
        libraryPromise = null;
        throw new EngineError(
          `The AI library (WebLLM ${WEBLLM_VERSION}) could not be loaded. Connect to the internet, open Velora once, and let it finish loading. After that the library is kept on this device. (${err.message})`,
        );
      });
  }
  return libraryPromise;
}

export function resolveModelId(spec, hasF16) {
  return hasF16 ? spec.webllmIdF16 : spec.webllmIdF32;
}

export function isModelLoaded(modelId) {
  return !!engine && engineModelId === modelId;
}

// The WebLLM model id currently in GPU memory, or null. Used to free memory when the user switches.
export function currentModelId() {
  return engine ? engineModelId : null;
}

// Asks the library whether the model files are still in the browser cache. Returns true or false,
// or null when this library version cannot say. The library is loaded only if it is already loaded
// or can be loaded now, so this never starts a download.
export async function modelFilesCached(modelId) {
  try {
    await loadLibrary();
  } catch {
    return null;
  }
  if (typeof library?.hasModelInCache !== 'function') return null;
  try {
    return !!(await library.hasModelInCache(modelId, library.prebuiltAppConfig));
  } catch {
    return null;
  }
}

// Loads the model into the GPU. Downloads the files first if they are not cached yet.
export async function loadEngine(spec, { hasF16 = false, onProgress } = {}) {
  const modelId = resolveModelId(spec, hasF16);
  if (engine && engineModelId === modelId) return engine;
  if (loadingPromise && loadingModelId === modelId) return loadingPromise;

  await loadLibrary();
  const known = library.prebuiltAppConfig?.model_list?.some((m) => m.model_id === modelId);
  if (library.prebuiltAppConfig?.model_list && !known) {
    throw new EngineError(
      `The model "${modelId}" is not in WebLLM ${WEBLLM_VERSION}. Open js/core/config.js and choose a model id from the WebLLM list, or update WEBLLM_VERSION.`,
    );
  }

  if (engine) await unloadEngine();

  loadingModelId = modelId;
  loadingPromise = library
    .CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        onProgress?.({
          progress: typeof report.progress === 'number' ? report.progress : 0,
          text: report.text || '',
        });
      },
    })
    .then((created) => {
      engine = created;
      engineModelId = modelId;
      return created;
    })
    .catch((err) => {
      throw new EngineError(explainLoadError(err));
    })
    .finally(() => {
      loadingPromise = null;
      loadingModelId = null;
    });
  return loadingPromise;
}

export async function unloadEngine() {
  if (!engine) return;
  try {
    await engine.unload?.();
  } catch {
    // Unloading is best effort.
  }
  engine = null;
  engineModelId = null;
}

// Streams a reply. onToken receives each new piece of text. Resolves with the full text.
// If the signal is aborted, generation stops and the text so far is returned.
export async function generate(messages, {
  maxTokens,
  temperature = 0.8,
  topP = 0.95,
  frequencyPenalty = 0,
  presencePenalty = 0,
  stop,
  signal,
  onToken,
} = {}) {
  if (!engine) throw new EngineError('The model is not loaded yet.');

  const stopGeneration = () => {
    try {
      engine.interruptGenerate();
    } catch {
      // nothing to stop
    }
  };
  signal?.addEventListener('abort', stopGeneration, { once: true });

  // Penalties discourage the repeated phrases small models fall into. Stop sequences stop the model
  // from writing the user's lines. Only set what is asked for, so older settings stay unchanged.
  const request = { messages, stream: true, max_tokens: maxTokens, temperature, top_p: topP };
  if (frequencyPenalty) request.frequency_penalty = frequencyPenalty;
  if (presencePenalty) request.presence_penalty = presencePenalty;
  if (stop?.length) request.stop = stop;

  let full = '';
  try {
    const stream = await engine.chat.completions.create(request);
    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const piece = chunk.choices?.[0]?.delta?.content ?? '';
      if (piece) {
        full += piece;
        onToken?.(piece);
      }
    }
  } catch (err) {
    if (signal?.aborted) return full;
    throw new EngineError(explainGenerateError(err));
  } finally {
    signal?.removeEventListener('abort', stopGeneration);
  }
  return full;
}

// Removes the cached files for these model ids. Also used when the user deletes a model.
export async function deleteModelFiles(modelIds) {
  // Use the library's own cleanup only if it is already loaded. Deleting should never download it.
  for (const id of modelIds) {
    try {
      await library?.deleteModelAllInfoInCache?.(id, library.prebuiltAppConfig);
    } catch {
      // fall back to the Cache API below
    }
  }
  if ('caches' in globalThis) {
    for (const name of await caches.keys()) {
      if (!/webllm|mlc/i.test(name)) continue;
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (modelIds.some((id) => request.url.includes(id))) await cache.delete(request);
      }
    }
  }
}

function explainLoadError(err) {
  const message = String(err?.message || err || '');
  if (/is not in WebLLM|prebuilt/i.test(message)) {
    return `This model is not in the WebLLM library version Velora uses. Try another model. (${message})`;
  }
  if (/adapter|webgpu|gpu/i.test(message)) {
    return `The GPU could not be used to load the model. Check the WebGPU section on the Profile page. (${message})`;
  }
  if (/memory|allocat|out of/i.test(message)) {
    return `This device ran out of memory while loading the model. Close other apps and try again. (${message})`;
  }
  if (/fetch|network|failed to load|NetworkError/i.test(message)) {
    return `The model files could not be downloaded. Check your connection and try again. Once downloaded, they stay on this device. (${message})`;
  }
  return `The model failed to load. (${message})`;
}

function explainGenerateError(err) {
  const message = String(err?.message || err || '');
  if (/context|too long|exceed/i.test(message)) {
    return 'This chat is too long for the model to read at once. Start a new chat, or shorten the character\'s main instructions.';
  }
  return `The reply could not be generated. Try again. (${message})`;
}

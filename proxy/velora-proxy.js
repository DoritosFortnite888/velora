// Velora online proxy (version 1.7.0).
//
// The Velora web page cannot keep a secret, so your AI provider's API key lives here instead. The page
// sends a chat request to this proxy; the proxy checks it, forwards it to the provider, and streams the
// reply back in one format that is the same for every provider. The key is never sent to the browser,
// never written to a file by this code, and never logged.
//
// This file has NO imports, so it can be pasted as one file into the Cloudflare Workers dashboard.
// It also runs on your PC through proxy/local-server.mjs (for testing).
//
// Settings are environment variables (secrets in Cloudflare, or $env: values on Windows):
//   API_KEY            required. Your provider's key. Store it as a SECRET. Never write it in this file.
//   ALLOWED_ORIGINS    required. The exact web addresses allowed to use this proxy, comma-separated,
//                      for example https://yourname.github.io  (no path, no trailing slash)
//   PROVIDER           "gemini" (default) or "openai" (any OpenAI-compatible service, such as Groq or Mistral)
//   MODEL              the model name. Default for gemini: gemini-2.5-flash-lite. Required for openai.
//   API_BASE           openai only: the provider's base address, for example https://api.groq.com/openai/v1
//                      gemini: optional override (used by the tests)
//   MAX_OUTPUT_TOKENS  optional, default 600. The most a reply may take.
//
// Endpoints:
//   GET  /health     public. Tells whether the proxy is set up. Sends no secrets and no key.
//   POST /v1/chat    body: { messages, max_tokens, temperature, top_p, frequency_penalty, presence_penalty, stop }
//                    answer: a stream of Server-Sent Events:
//                      event: delta   data: {"text":"..."}     one piece of the reply
//                      event: done    data: {"finish":"stop"}  the reply finished normally
//                      event: error   data: {"code":"...","message":"..."}  the reply stopped

const VERSION = '1.7.0';
const MAX_BODY_BYTES = 200000;
const MAX_MESSAGES = 80;
const MAX_MESSAGE_CHARS = 8000;
const MAX_TOTAL_CHARS = 60000;
const UPSTREAM_TIMEOUT_MS = 60000;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite';
const BLOCKED_FINISH = ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

class ProxyError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export default {
  async fetch(request, env = {}) {
    try {
      return await handle(request, env);
    } catch (err) {
      return jsonError(500, 'internal', 'The proxy hit an unexpected error. Check the proxy settings.', corsHeaders(''));
    }
  },
};

async function handle(request, env) {
  const origin = (request.headers.get('Origin') || '').replace(/\/+$/, '');
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  const allowed = allowedOrigins(env).includes(origin);

  // The status check is public, so it can be opened in a browser's address bar. It shows whether the proxy
  // is set up, and the provider and model names. It shows no key. Only allowed pages get permission to read it.
  if (request.method === 'GET' && path === '/health') {
    return healthResponse(env, allowed ? corsHeaders(origin) : { 'Cache-Control': 'no-store' });
  }

  // Only the web addresses listed in ALLOWED_ORIGINS may use the chat. Everything else gets nothing.
  if (!allowed) return new Response('Forbidden', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const cors = corsHeaders(origin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method === 'POST' && path === '/v1/chat') return chatResponse(request, env, cors);
  return jsonError(404, 'not_found', 'Unknown address for the Velora proxy.', cors);
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

function providerSettings(env) {
  const provider = String(env.PROVIDER || 'gemini').trim().toLowerCase();
  const model = String(env.MODEL || (provider === 'gemini' ? DEFAULT_GEMINI_MODEL : '')).trim();
  const base = String(env.API_BASE || (provider === 'gemini' ? GEMINI_BASE : '')).trim().replace(/\/+$/, '');
  return { provider, model, base };
}

// Returns a message for the person running the proxy, or null when everything needed is set.
function configProblem(env) {
  const settings = providerSettings(env);
  if (!env.API_KEY) return 'The API_KEY secret is missing. Add your provider key as a secret in the proxy settings. See docs/ONLINE_AI_SETUP.md.';
  if (settings.provider !== 'gemini' && settings.provider !== 'openai') return 'PROVIDER must be gemini or openai.';
  if (!settings.model) return 'MODEL is missing. Set it to a model name from your provider.';
  if (!settings.base) return 'API_BASE is missing. For an OpenAI-compatible provider, set it to the provider\'s base address.';
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(settings.base);
  if (!/^https:\/\//.test(settings.base) && !local) return 'API_BASE must start with https://.';
  return null;
}

function maxOutputTokens(env) {
  return clampNumber(env.MAX_OUTPUT_TOKENS, 50, 2000, 600);
}

function healthResponse(env, cors) {
  const problem = configProblem(env);
  const settings = providerSettings(env);
  return json(problem ? 503 : 200, {
    ok: !problem,
    version: VERSION,
    provider: problem ? null : settings.provider,
    model: problem ? null : settings.model,
    message: problem || 'The proxy is set up. Use Test connection to check the AI provider.',
  }, cors);
}

async function chatResponse(request, env, cors) {
  const problem = configProblem(env);
  if (problem) return jsonError(503, 'not_configured', problem, cors);

  const settings = providerSettings(env);
  let events;
  try {
    const req = await readRequest(request, env);
    events = settings.provider === 'gemini'
      ? await callGemini(settings, env.API_KEY, req)
      : await callOpenAI(settings, env.API_KEY, req);
  } catch (err) {
    const { code, message, status } = describeError(err);
    return jsonError(status, code, message, cors);
  }
  return streamResponse(events, cors);
}

// ---------- Reading and checking the request from the page ----------

async function readRequest(request, env) {
  const text = await request.text();
  if (byteLength(text) > MAX_BODY_BYTES) throw new ProxyError(413, 'payload_too_large', 'This chat is too long to send online. Start a new chat or shorten the last message.');
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ProxyError(400, 'bad_request', 'The request was not valid JSON.');
  }
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages)) {
    throw new ProxyError(400, 'bad_request', 'The request needs a list of messages.');
  }
  if (body.messages.length < 1 || body.messages.length > MAX_MESSAGES) {
    throw new ProxyError(400, 'bad_request', `The request needs between 1 and ${MAX_MESSAGES} messages.`);
  }

  let total = 0;
  const messages = body.messages.map((item) => {
    if (!item || !['system', 'user', 'assistant'].includes(item.role) || typeof item.content !== 'string') {
      throw new ProxyError(400, 'bad_request', 'Each message needs a role (system, user or assistant) and some text.');
    }
    if (item.content.length > MAX_MESSAGE_CHARS) {
      throw new ProxyError(413, 'payload_too_large', 'One message is too long to send online.');
    }
    total += item.content.length;
    return { role: item.role, content: item.content };
  });
  if (total > MAX_TOTAL_CHARS) throw new ProxyError(413, 'payload_too_large', 'This chat is too long to send online. Start a new chat.');
  if (!messages.some((item) => item.role === 'user')) {
    throw new ProxyError(400, 'bad_request', 'The request needs at least one user message.');
  }

  return {
    messages,
    maxTokens: clampNumber(body.max_tokens, 1, maxOutputTokens(env), 180),
    temperature: clampNumber(body.temperature, 0, 1.5, 0.8),
    topP: clampNumber(body.top_p, 0, 1, 0.92),
    frequencyPenalty: clampNumber(body.frequency_penalty, -2, 2, 0),
    presencePenalty: clampNumber(body.presence_penalty, -2, 2, 0),
    stop: Array.isArray(body.stop)
      ? body.stop.filter((item) => typeof item === 'string' && item.length > 0 && item.length <= 40).slice(0, 4)
      : [],
  };
}

// ---------- Google Gemini ----------

async function callGemini(settings, apiKey, req) {
  // Gemini takes the instructions separately and calls the assistant "model". Consecutive messages
  // from the same speaker are joined, and the first turn must come from the user.
  const systemParts = [];
  const contents = [];
  for (const item of req.messages) {
    if (item.role === 'system') {
      if (item.content.trim()) systemParts.push(item.content);
      continue;
    }
    const role = item.role === 'assistant' ? 'model' : 'user';
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts[0].text += `\n\n${item.content}`;
    } else {
      contents.push({ role, parts: [{ text: item.content }] });
    }
  }
  if (contents.length === 0 || contents[0].role !== 'user') {
    contents.unshift({ role: 'user', parts: [{ text: '[The chat begins.]' }] });
  }

  const generationConfig = {
    temperature: req.temperature,
    topP: req.topP,
    maxOutputTokens: req.maxTokens,
  };
  if (req.stop.length) generationConfig.stopSequences = req.stop;
  if (req.frequencyPenalty) generationConfig.frequencyPenalty = req.frequencyPenalty;
  if (req.presencePenalty) generationConfig.presencePenalty = req.presencePenalty;

  const body = { contents, generationConfig };
  if (systemParts.length) body.systemInstruction = { parts: [{ text: systemParts.join('\n\n') }] };

  const url = `${settings.base}/models/${encodeURIComponent(settings.model)}:streamGenerateContent?alt=sse`;
  const response = await fetchUpstream(url, {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  }, body, apiKey);
  return geminiEvents(response);
}

async function* geminiEvents(response) {
  let finish = null;  // set by the final frame. Without it the reply was cut off by the connection.
  for await (const data of sseData(response.body)) {
    let chunk;
    try {
      chunk = JSON.parse(data);
    } catch {
      continue;
    }
    const reason = chunk.promptFeedback?.blockReason;
    if (reason) throw new ProxyError(422, 'blocked', `The AI provider blocked this message (${reason}).`);
    const candidate = chunk.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) {
      if (typeof part.text === 'string' && part.text && !part.thought) yield { type: 'text', text: part.text };
    }
    if (candidate?.finishReason) finish = candidate.finishReason;
  }
  if (BLOCKED_FINISH.includes(finish)) {
    throw new ProxyError(422, 'blocked', `The AI provider stopped this reply (${finish}).`);
  }
  if (!finish) throw new ProxyError(502, 'provider_stream_failed', 'The AI provider ended the reply early.');
  yield { type: 'done', finish: finish === 'MAX_TOKENS' ? 'length' : 'stop' };
}

// ---------- Any OpenAI-compatible provider (OpenAI, Groq, Mistral, OpenRouter, ...) ----------

async function callOpenAI(settings, apiKey, req) {
  const body = {
    model: settings.model,
    messages: req.messages,
    stream: true,
    max_tokens: req.maxTokens,
    temperature: req.temperature,
    top_p: req.topP,
  };
  if (req.frequencyPenalty) body.frequency_penalty = req.frequencyPenalty;
  if (req.presencePenalty) body.presence_penalty = req.presencePenalty;
  if (req.stop.length) body.stop = req.stop;

  const response = await fetchUpstream(`${settings.base}/chat/completions`, {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }, body, apiKey);
  return openAIEvents(response);
}

async function* openAIEvents(response) {
  let finish = null;
  let ended = false; // true once [DONE] or a finish reason arrives. Otherwise the reply was cut off.
  for await (const data of sseData(response.body)) {
    if (data === '[DONE]') {
      ended = true;
      break;
    }
    let chunk;
    try {
      chunk = JSON.parse(data);
    } catch {
      continue;
    }
    if (chunk.error) throw new ProxyError(502, 'provider_unavailable', 'The AI provider returned an error during the reply.');
    const choice = chunk.choices?.[0];
    if (typeof choice?.delta?.content === 'string' && choice.delta.content) {
      yield { type: 'text', text: choice.delta.content };
    }
    if (choice?.finish_reason) {
      finish = choice.finish_reason;
      ended = true;
    }
  }
  if (finish === 'content_filter') throw new ProxyError(422, 'blocked', 'The AI provider stopped this reply (content filter).');
  if (!ended) throw new ProxyError(502, 'provider_stream_failed', 'The AI provider ended the reply early.');
  yield { type: 'done', finish: finish === 'length' ? 'length' : 'stop' };
}

// ---------- Shared upstream helpers ----------

async function fetchUpstream(url, headers, body, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw new ProxyError(504, 'timeout', 'The AI provider took too long to answer. Try again.');
    throw new ProxyError(502, 'network', 'The proxy could not reach the AI provider. Try again in a moment.');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw await upstreamFailure(response, apiKey);
  return response;
}

// Turns a provider's error into a short message. The provider's own text is shown only after the key
// has been removed from it, and only for errors that usually explain a setting problem.
async function upstreamFailure(response, apiKey) {
  let detail = '';
  try {
    const data = await response.json();
    detail = redact(String(data?.error?.message ?? '').slice(0, 160), apiKey);
  } catch {
    detail = '';
  }
  const status = response.status;
  if (status === 429) return new ProxyError(429, 'rate_limited', 'The AI provider\'s limit has been reached for now. Wait a while, or switch to On this device.');
  if (status === 401 || status === 403) return new ProxyError(502, 'auth', 'The AI provider did not accept the API_KEY in the proxy settings, or this service is not available for it. Check the key and the provider\'s terms.');
  if (status === 404) return new ProxyError(502, 'model_not_found', `The model name in the proxy settings was not found by the provider. Check MODEL.${detail ? ` (${detail})` : ''}`);
  if (status === 400) return new ProxyError(400, 'bad_request', `The AI provider refused the request.${detail ? ` (${detail})` : ''}`);
  return new ProxyError(502, 'provider_unavailable', `The AI provider had a problem (status ${status}). Try again.`);
}

function redact(text, apiKey) {
  return apiKey ? String(text).split(apiKey).join('[redacted]') : String(text);
}

// Reads Server-Sent Events from the provider and yields the "data:" text of each one.
async function* sseData(stream) {
  const reader = stream.getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf('\n');
    while (index !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/, '');
      buffer = buffer.slice(index + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
      index = buffer.indexOf('\n');
    }
  }
  buffer += decoder.decode();
  for (const line of buffer.split('\n')) {
    if (line.startsWith('data:')) yield line.slice(5).trim();
  }
}

// ---------- Sending the stream back to the page ----------

function streamResponse(events, cors) {
  const iterator = events[Symbol.asyncIterator]();
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        if (value.type === 'text') {
          controller.enqueue(encoder.encode(sseFrame('delta', { text: value.text })));
        } else {
          controller.enqueue(encoder.encode(sseFrame('done', { finish: value.finish })));
          controller.close();
        }
      } catch (err) {
        const { code, message } = describeError(err, 'provider_stream_failed');
        controller.enqueue(encoder.encode(sseFrame('error', { code, message })));
        controller.close();
      }
    },
    cancel() {
      // The page stopped listening (Stop, or the page was closed). Stop reading from the provider.
      try {
        iterator.return?.();
      } catch {
        // already finished
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Accel-Buffering': 'no',
    },
  });
}

function sseFrame(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function describeError(err, fallbackCode = 'internal') {
  if (err instanceof ProxyError) return { status: err.status, code: err.code, message: err.message };
  return {
    status: 500,
    code: fallbackCode,
    message: fallbackCode === 'provider_stream_failed'
      ? 'The connection to the AI provider was interrupted. The reply may be incomplete.'
      : 'The proxy hit an unexpected error. Check the proxy settings.',
  };
}

function jsonError(status, code, message, cors) {
  return json(status, { error: { code, message } }, cors);
}

function json(status, data, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (value === undefined || value === null || value === '' || !Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function byteLength(text) {
  return encoder.encode(text).length;
}

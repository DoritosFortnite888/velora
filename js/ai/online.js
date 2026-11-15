// Online AI: the network side. A chat is sent to YOUR Velora proxy (see docs/ONLINE_AI_SETUP.md), which
// holds the AI provider's key and forwards the chat to the provider. The reply comes back as a stream.
// This page never holds a provider key, and nothing here stores one.
import { ONLINE } from '../core/config.js';
import { createSSEParser } from '../core/sse.js';

export class OnlineError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Plain-language messages for each error code. The proxy's own message is used only where it is safe to show.
export function messageFor(code, serverMessage = '') {
  switch (code) {
    case 'network':
      return 'Velora could not reach your online AI proxy. Check the internet connection and the proxy address in Online AI setup. You can switch to On this device in Profile.';
    case 'forbidden_origin':
      return 'The proxy does not allow this web address. Add the exact address of this page (for example https://yourname.github.io) to ALLOWED_ORIGINS.';
    case 'not_configured':
      return `The online proxy is not set up yet. ${serverMessage}`.trim();
    case 'rate_limited':
      return 'The AI provider\'s free limit has been reached for now. Wait a while, or switch to On this device in Profile.';
    case 'auth':
      return 'The AI provider did not accept the key stored in the proxy. Check the API_KEY secret.';
    case 'model_not_found':
      return `The model name in the proxy settings was not found. Check MODEL. ${serverMessage}`.trim();
    case 'blocked':
      return 'The AI provider\'s safety filter stopped this reply. Try a different message, or regenerate.';
    case 'timeout':
      return 'The AI provider took too long to answer. Tap regenerate to try again.';
    case 'payload_too_large':
      return 'This chat is too long to send online. Start a new chat, or shorten the last message.';
    case 'connection_lost':
    case 'provider_stream_failed':
      return 'The connection stopped before the reply finished. The part already shown is kept. Tap regenerate to try again.';
    case 'bad_response':
      return 'The proxy sent a reply in an unexpected format. Check that the proxy address is correct.';
    case 'bad_request':
      return `The request was refused. ${serverMessage}`.trim();
    default:
      return serverMessage || 'The online reply could not be completed. Try again.';
  }
}

// Checks the address the person typed and returns it in a clean form (https, or http only on this computer).
export function normalizeProxyUrl(raw) {
  const text = String(raw ?? '').trim();
  if (!text) throw new OnlineError('config', 'Enter the proxy address first.');
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new OnlineError('config', 'That is not a web address. It should look like https://velora-proxy.yourname.workers.dev');
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new OnlineError('config', 'The proxy address must start with https://. http:// is only allowed for testing on this computer.');
  }
  if (url.username || url.password) throw new OnlineError('config', 'The proxy address must not contain a username or password.');
  if (url.search || url.hash) throw new OnlineError('config', 'The proxy address must not contain ? or #. Use only the address of the proxy.');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

const sleep = (ms, signal) => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
});

async function errorFromResponse(response) {
  let code = `http_${response.status}`;
  let message = '';
  try {
    const data = await response.json();
    code = data?.error?.code || code;
    message = data?.error?.message || data?.message || '';
  } catch {
    // not JSON: keep the generic code
  }
  return new OnlineError(code, messageFor(code, message));
}

// Checks that the proxy is set up. Sends nothing to the AI provider and uses no quota.
export async function checkProxyHealth(proxyUrl, { fetchImpl = globalThis.fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(`${proxyUrl}/health`, { method: 'GET', headers: { Accept: 'application/json' } });
  } catch {
    throw new OnlineError('network', messageFor('network'));
  }
  let data = {};
  try {
    data = await response.json();
  } catch {
    throw new OnlineError('network', messageFor('network'));
  }
  if (!response.ok || !data.ok) throw new OnlineError('not_configured', messageFor('not_configured', data.message));
  return data;
}

// Streams one reply through the proxy. Resolves with the full text. Stop (abort) keeps the text so far,
// like the on-device engine does. Retries only when no connection could be made at all, so a reply is
// never written twice.
export async function streamOnlineReply(proxyUrl, messages, options = {}, hooks = {}) {
  const {
    signal,
    onToken,
    onStatus,
    fetchImpl = globalThis.fetch.bind(globalThis),
    stallMs = ONLINE.stallMs,
    retryDelayMs = ONLINE.retryDelayMs,
    connectAttempts = ONLINE.connectAttempts,
  } = { ...hooks, ...options };

  const body = JSON.stringify({
    messages,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    top_p: options.topP,
    frequency_penalty: options.frequencyPenalty,
    presence_penalty: options.presencePenalty,
    stop: options.stop,
  });

  let response = null;
  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) return '';
    try {
      response = await fetchImpl(`${proxyUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body,
        signal,
      });
      break;
    } catch {
      if (signal?.aborted) return '';
      if (attempt >= connectAttempts) throw new OnlineError('network', messageFor('network'));
      onStatus?.(`Connection problem. Trying again (${attempt + 1} of ${connectAttempts})…`);
      await sleep(retryDelayMs * attempt, signal);
    }
  }

  if (!response.ok) throw await errorFromResponse(response);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/event-stream') || !response.body) {
    throw new OnlineError('bad_response', messageFor('bad_response'));
  }

  let full = '';
  let finished = false;
  let firstPiece = true;
  let failure = null;
  const parser = createSSEParser(({ event, data }) => {
    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    if (event === 'delta' && typeof payload.text === 'string') {
      if (firstPiece) {
        firstPiece = false;
        onStatus?.('');
      }
      full += payload.text;
      onToken?.(payload.text);
    } else if (event === 'done') {
      finished = true;
    } else if (event === 'error') {
      failure = new OnlineError(payload.code || 'error', messageFor(payload.code, payload.message));
    }
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let stalled = false;
  let timer = null;
  const armStallTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      reader.cancel().catch(() => {});
    }, stallMs);
  };
  const onAbort = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', onAbort, { once: true });
  armStallTimer();

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      armStallTimer();
      parser.push(decoder.decode(value, { stream: true }));
      if (failure) throw failure;
      if (finished) break;
    }
    if (!finished && !failure) parser.push(decoder.decode());
    parser.end();
  } catch (err) {
    if (err instanceof OnlineError) throw err;
    if (signal?.aborted) return full;
    if (stalled) throw new OnlineError('timeout', messageFor('timeout'));
    throw new OnlineError('connection_lost', messageFor('connection_lost'));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock?.();
  }

  if (failure) throw failure;
  if (signal?.aborted) return full; // the person pressed Stop: keep what arrived
  if (stalled) throw new OnlineError('timeout', messageFor('timeout'));
  if (!finished) throw new OnlineError('connection_lost', messageFor('connection_lost'));
  return full;
}

// Sends one tiny real request to the AI provider through the proxy. This uses a few tokens of your
// free quota, so the setup page says so before the button is pressed.
export async function testOnlineConnection(proxyUrl, hooks = {}) {
  const health = await checkProxyHealth(proxyUrl, hooks);
  const sample = await streamOnlineReply(proxyUrl, [
    { role: 'system', content: 'You are a connection test. Answer in one word.' },
    { role: 'user', content: 'Reply with the word: ready' },
  ], { maxTokens: 8, temperature: 0.2, topP: 1 }, { ...hooks, connectAttempts: 1 });
  if (!sample.trim()) throw new OnlineError('empty_reply', 'The AI provider answered, but with an empty reply. Try again.');
  return { provider: health.provider, model: health.model, sample: sample.trim().slice(0, 40) };
}

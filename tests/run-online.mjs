// Tests for online AI: the event parser, the address check, the proxy (security and request format,
// checked against a mock provider), the page's streaming client (retry, stall, stop) and the mode rule.
// No real provider is contacted, and no key is needed. Run with: node tests/run-online.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSSEParser } from '../js/core/sse.js';
import { normalizeProxyUrl, streamOnlineReply, messageFor, OnlineError } from '../js/ai/online.js';
import { resolveAIMode } from '../js/ai/mode.js';
import { LIMITS, ONLINE_LIMITS } from '../js/core/config.js';
import { buildChatMessages } from '../js/core/prompt.js';
import proxy from '../proxy/velora-proxy.js';
import { startMockGemini } from './mock-gemini.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${String(err && err.stack ? err.stack : err).split('\n').slice(0, 4).join('\n       ')}`);
  }
}
const section = (title) => console.log(`\n${title}`);

// A fake key for the tests. It must never appear in any response, header or body the proxy returns.
const KEY = 'AIzaFAKE-test-key-0123456789abcdef';
const ORIGIN = 'https://velora.example.github.io';
const mock = await startMockGemini({ expectedKey: KEY });
const mockOrigin = new URL(mock.url).origin;

const env = (extra = {}) => ({ API_KEY: KEY, ALLOWED_ORIGINS: ORIGIN, API_BASE: mock.url, ...extra });
function request(path, { method = 'POST', origin = ORIGIN, body, raw } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  return new Request(`http://proxy.test${path}`, {
    method,
    headers,
    body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
  });
}
const chatBody = (text, extra = {}) => ({
  messages: [{ role: 'system', content: 'You are Mira, a calm guide.' }, { role: 'user', content: text }],
  max_tokens: 120,
  temperature: 0.8,
  top_p: 0.92,
  frequency_penalty: 0.4,
  presence_penalty: 0.2,
  stop: ['\nUser:'],
  ...extra,
});
function parseEvents(text) {
  const events = [];
  const parser = createSSEParser(({ event, data }) => events.push({ event, data: JSON.parse(data) }));
  parser.push(text);
  parser.end();
  return events;
}
async function mockLog() {
  return (await fetch(`${mockOrigin}/__requests`)).json();
}
const noKey = async (response) => {
  const text = await response.text();
  assert.ok(!text.includes(KEY), 'the API key must never appear in a proxy response');
  return text;
};
const headerText = (response) => [...response.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');

section('Event parser (page)');

await test('events are read the same when the text arrives in pieces of any size', () => {
  const whole = 'event: delta\ndata: {"text":"Hi"}\n\nevent: done\ndata: {"finish":"stop"}\n\n';
  const expected = parseEvents(whole);
  for (const size of [1, 2, 3, 7]) {
    const got = [];
    const parser = createSSEParser((e) => got.push(e));
    for (let i = 0; i < whole.length; i += size) parser.push(whole.slice(i, i + size));
    parser.end();
    assert.deepEqual(got, expected.map((e) => ({ event: e.event, data: JSON.stringify(e.data) })));
  }
  assert.equal(expected.length, 2);
});

await test('CRLF line endings, comments, and multi-line data are handled', () => {
  const events = [];
  const parser = createSSEParser((e) => events.push(e));
  parser.push(': keep-alive\r\nevent: delta\r\ndata: first\r\ndata: second\r\n\r\n');
  parser.end();
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'delta');
  assert.equal(events[0].data, 'first\nsecond');
});

await test('a frame without an event name is a plain message', () => {
  const events = [];
  const parser = createSSEParser((e) => events.push(e));
  parser.push('data: {"a":1}\n\n');
  parser.end();
  assert.equal(events[0].event, 'message');
});

section('Proxy address check (page)');

await test('a proxy address is cleaned to its origin and path', () => {
  assert.equal(normalizeProxyUrl('https://velora-proxy.example.workers.dev/'), 'https://velora-proxy.example.workers.dev');
  assert.equal(normalizeProxyUrl('  https://a.example.com  '), 'https://a.example.com');
  assert.equal(normalizeProxyUrl('http://localhost:8787'), 'http://localhost:8787');
  assert.equal(normalizeProxyUrl('http://127.0.0.1:8787/'), 'http://127.0.0.1:8787');
});

await test('addresses that could send chats to an unsafe place are refused', () => {
  for (const bad of ['', '   ', 'not a url', 'http://example.com', 'ftp://example.com', 'https://a.example.com?x=1', 'https://a.example.com/#top', 'https://user:pass@a.example.com']) {
    assert.throws(() => normalizeProxyUrl(bad), OnlineError, `should refuse: "${bad}"`);
  }
});

await test('every error code has a plain-language message, and unknown codes keep the server text', () => {
  for (const code of ['network', 'forbidden_origin', 'not_configured', 'rate_limited', 'auth', 'model_not_found', 'blocked', 'timeout', 'payload_too_large', 'connection_lost', 'bad_response', 'bad_request']) {
    assert.ok(messageFor(code, 'x').length > 20, code);
  }
  assert.equal(messageFor('something_new', 'Server text.'), 'Server text.');
  assert.match(messageFor('rate_limited'), /limit/);
});

section('Proxy: security');

await test('a web page that is not on ALLOWED_ORIGINS gets nothing from the proxy', async () => {
  const response = await proxy.fetch(request('/v1/chat', { origin: 'https://evil.example.com', body: chatBody('hello') }), env());
  assert.equal(response.status, 403);
  await noKey(response);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

await test('chat requests with no Origin header are refused', async () => {
  const response = await proxy.fetch(request('/v1/chat', { origin: null, body: chatBody('hello') }), env());
  assert.equal(response.status, 403);
});

await test('with ALLOWED_ORIGINS empty, chat is refused for everyone', async () => {
  const response = await proxy.fetch(request('/v1/chat', { body: chatBody('hello') }), env({ ALLOWED_ORIGINS: '' }));
  assert.equal(response.status, 403);
});

await test('the status check opens in a browser address bar, but other sites get no permission to read it', async () => {
  const browser = await proxy.fetch(request('/health', { method: 'GET', origin: null }), env());
  assert.equal(browser.status, 200);
  assert.equal(JSON.parse(await noKey(browser)).ok, true);
  assert.equal(browser.headers.get('access-control-allow-origin'), null);
  const other = await proxy.fetch(request('/health', { method: 'GET', origin: 'https://evil.example.com' }), env());
  assert.equal(other.headers.get('access-control-allow-origin'), null);
  await noKey(other);
});

await test('a missing API_KEY is reported without any key, and chat is refused', async () => {
  const health = await proxy.fetch(request('/health', { method: 'GET' }), env({ API_KEY: '' }));
  assert.equal(health.status, 503);
  const data = JSON.parse(await noKey(health));
  assert.equal(data.ok, false);
  assert.match(data.message, /API_KEY/);
  const chat = await proxy.fetch(request('/v1/chat', { body: chatBody('hi') }), env({ API_KEY: '' }));
  assert.equal(chat.status, 503);
  assert.equal(JSON.parse(await chat.text()).error.code, 'not_configured');
});

await test('health says the proxy is set up, but shows no key and no address of the provider', async () => {
  const response = await proxy.fetch(request('/health', { method: 'GET' }), env());
  assert.equal(response.status, 200);
  const text = await noKey(response);
  const data = JSON.parse(text);
  assert.equal(data.ok, true);
  assert.equal(data.provider, 'gemini');
  assert.equal(data.model, 'gemini-2.5-flash-lite');
  assert.ok(!text.includes(mock.url), 'the provider address is not shown');
  assert.ok(!headerText(response).includes(KEY));
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
});

await test('CORS preflight answers for an allowed origin only', async () => {
  const ok = await proxy.fetch(request('/v1/chat', { method: 'OPTIONS' }), env());
  assert.equal(ok.status, 204);
  assert.match(ok.headers.get('access-control-allow-headers'), /Content-Type/);
  const refused = await proxy.fetch(request('/v1/chat', { method: 'OPTIONS', origin: 'https://evil.example.com' }), env());
  assert.equal(refused.status, 403);
});

await test('unknown addresses and wrong methods get a plain 404', async () => {
  assert.equal((await proxy.fetch(request('/nope'), env())).status, 404);
  assert.equal((await proxy.fetch(request('/v1/chat', { method: 'GET' }), env())).status, 404);
});

await test('a provider key that is wrong gives a clear message without echoing anything back', async () => {
  const response = await proxy.fetch(request('/v1/chat', { body: chatBody('hello') }), env({ API_KEY: 'AIzaWRONG-0000000000000000' }));
  assert.equal(response.status, 502);
  const data = JSON.parse(await response.text());
  assert.equal(data.error.code, 'auth');
});

section('Proxy: request format (against the mock Gemini)');

await test('a reply streams as deltas and ends with a done event', async () => {
  const response = await proxy.fetch(request('/v1/chat', { body: chatBody('Tell me about your day') }), env());
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const events = parseEvents(await noKey(response));
  const text = events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
  assert.equal(text, '*Smiles and tilts her head* "Tell me more about that. I want to hear every part." *Leans closer*');
  assert.equal(events.at(-1).event, 'done');
  assert.equal(events.filter((e) => e.event === 'done').length, 1);
});

await test('the provider receives the instructions, the roles and the settings it expects', async () => {
  const before = (await mockLog()).length;
  const response = await proxy.fetch(request('/v1/chat', { body: chatBody('Hi', { max_tokens: 120 }) }), env());
  await response.text();
  const log = (await mockLog()).slice(before);
  assert.equal(log.length, 1);
  const sent = log[0];
  assert.match(sent.url, /\/models\/gemini-2\.5-flash-lite:streamGenerateContent\?alt=sse$/);
  assert.equal(sent.headers['content-type'], 'application/json');
  assert.equal(sent.body.systemInstruction.parts[0].text, 'You are Mira, a calm guide.');
  assert.deepEqual(sent.body.contents, [{ role: 'user', parts: [{ text: 'Hi' }] }]);
  assert.equal(sent.body.generationConfig.maxOutputTokens, 120);
  assert.deepEqual(sent.body.generationConfig.stopSequences, ['\nUser:']);
  assert.equal(sent.body.generationConfig.frequencyPenalty, 0.4);
  assert.equal(sent.body.generationConfig.presencePenalty, 0.2);
});

await test('messages are converted: assistant becomes model, a chat that starts with the greeting gets a first user turn, and same-speaker messages are joined', async () => {
  const before = (await mockLog()).length;
  const response = await proxy.fetch(request('/v1/chat', {
    body: {
      messages: [
        { role: 'system', content: 'Rules A.' },
        { role: 'assistant', content: 'Hello there.' },
        { role: 'user', content: 'First.' },
        { role: 'user', content: 'Second.' },
        { role: 'assistant', content: '*Nods*' },
        { role: 'user', content: 'Now.' },
        { role: 'system', content: 'Note for the next reply.' },
      ],
    },
  }), env());
  await response.text();
  const sent = (await mockLog()).slice(before)[0].body;
  assert.equal(sent.systemInstruction.parts[0].text, 'Rules A.\n\nNote for the next reply.');
  assert.deepEqual(sent.contents.map((c) => c.role), ['user', 'model', 'user', 'model', 'user']);
  assert.equal(sent.contents[0].parts[0].text, '[The chat begins.]');
  assert.equal(sent.contents[2].parts[0].text, 'First.\n\nSecond.');
});

await test('an upstream rate limit becomes a 429 with the rate_limited code', async () => {
  const response = await proxy.fetch(request('/v1/chat', { body: chatBody('[429]') }), env());
  assert.equal(response.status, 429);
  const data = JSON.parse(await noKey(response));
  assert.equal(data.error.code, 'rate_limited');
});

await test('an upstream error that repeats the key shows the message with the key removed', async () => {
  const response = await proxy.fetch(request('/v1/chat', { body: chatBody('[400]') }), env());
  assert.equal(response.status, 400);
  const text = await noKey(response);
  const data = JSON.parse(text);
  assert.equal(data.error.code, 'bad_request');
  assert.ok(text.includes('[redacted]'));
});

await test('a model name the provider does not know gives model_not_found', async () => {
  const response = await proxy.fetch(request('/v1/chat', { body: chatBody('[404]') }), env());
  assert.equal(response.status, 502);
  assert.equal(JSON.parse(await noKey(response)).error.code, 'model_not_found');
});

await test('a provider safety block is sent as a blocked error, with no done event', async () => {
  const response = await proxy.fetch(request('/v1/chat', { body: chatBody('[safety]') }), env());
  assert.equal(response.status, 200);
  const events = parseEvents(await noKey(response));
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'error');
  assert.equal(events[0].data.code, 'blocked');
});

await test('a reply cut off by the connection is never reported as finished', async () => {
  const response = await proxy.fetch(request('/v1/chat', { body: chatBody('[drop]') }), env());
  const events = parseEvents(await noKey(response));
  assert.ok(!events.some((e) => e.event === 'done'), 'no done event after a cut-off reply');
  const error = events.find((e) => e.event === 'error');
  assert.ok(error, 'an error event is sent instead');
  assert.equal(error.data.code, 'provider_stream_failed');
  assert.ok(events.some((e) => e.event === 'delta'), 'the part that arrived is still sent');
});

await test('max_tokens is capped by MAX_OUTPUT_TOKENS (default 600)', async () => {
  const before = (await mockLog()).length;
  const response = await proxy.fetch(request('/v1/chat', { body: chatBody('Hi', { max_tokens: 999999 }) }), env());
  await response.text();
  const sent = (await mockLog()).slice(before)[0].body;
  assert.equal(sent.generationConfig.maxOutputTokens, 600);
});

section('Proxy: request checks');

await test('bad requests are refused with clear codes, before anything is sent to the provider', async () => {
  const before = (await mockLog()).length;
  const cases = [
    [{ raw: 'not json' }, 400, 'bad_request'],
    [{ body: {} }, 400, 'bad_request'],
    [{ body: { messages: [] } }, 400, 'bad_request'],
    [{ body: { messages: [{ role: 'god', content: 'x' }] } }, 400, 'bad_request'],
    [{ body: { messages: [{ role: 'assistant', content: 'x' }] } }, 400, 'bad_request'],
    [{ body: { messages: Array.from({ length: 81 }, () => ({ role: 'user', content: 'x' })) } }, 400, 'bad_request'],
    [{ body: { messages: [{ role: 'user', content: 'x'.repeat(9000) }] } }, 413, 'payload_too_large'],
    [{ body: { messages: Array.from({ length: 8 }, () => ({ role: 'user', content: 'x'.repeat(8000) })) } }, 413, 'payload_too_large'],
    [{ raw: JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(199000) }] }) }, 413, 'payload_too_large'],
  ];
  for (const [input, status, code] of cases) {
    const response = await proxy.fetch(request('/v1/chat', input), env());
    assert.equal(response.status, status, JSON.stringify(input).slice(0, 60));
    assert.equal(JSON.parse(await noKey(response)).error.code, code);
  }
  assert.equal((await mockLog()).length, before, 'nothing was forwarded');
});

await test('a bad PROVIDER, a missing MODEL or an insecure API_BASE are reported as setup problems', async () => {
  const cases = [
    env({ PROVIDER: 'mystery' }),
    env({ PROVIDER: 'openai', MODEL: '', API_BASE: 'https://api.example.com/v1' }),
    env({ API_BASE: 'http://api.example.com/v1beta' }),
  ];
  for (const c of cases) {
    const health = await proxy.fetch(request('/health', { method: 'GET' }), c);
    assert.equal(health.status, 503);
    await noKey(health);
  }
});

section('Proxy: OpenAI-compatible providers (Groq, Mistral, OpenRouter, OpenAI)');

const openai = await new Promise((resolveServer) => {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    if (req.url === '/__requests') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(seen));
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    seen.push({ url: req.url, auth: req.headers.authorization, body });
    if (body.messages.some((m) => m.content.includes('[cut]'))) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"Partly"}}]}\n\n');
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"role":"assistant","content":"Hello "}}]}\n\n');
    res.write('data: {"choices":[{"delta":{"content":"friend."},"finish_reason":"stop"}]}\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
  });
  server.listen(0, '127.0.0.1', () => resolveServer({ server, url: `http://127.0.0.1:${server.address().port}`, seen }));
});

await test('an OpenAI-compatible provider gets the key in the header and its reply is streamed the same way', async () => {
  const oEnv = env({ PROVIDER: 'openai', MODEL: 'test-model', API_BASE: `${openai.url}/openai/v1` });
  const response = await proxy.fetch(request('/v1/chat', { body: chatBody('Hi', { stop: ['\nUser:'] }) }), oEnv);
  const events = parseEvents(await noKey(response));
  assert.equal(events.filter((e) => e.event === 'delta').map((e) => e.data.text).join(''), 'Hello friend.');
  assert.equal(events.at(-1).event, 'done');
  const sent = openai.seen.at(-1);
  assert.equal(sent.url, '/openai/v1/chat/completions');
  assert.equal(sent.auth, `Bearer ${KEY}`);
  assert.equal(sent.body.model, 'test-model');
  assert.equal(sent.body.stream, true);
  assert.equal(sent.body.messages[0].role, 'system');
  assert.deepEqual(sent.body.stop, ['\nUser:']);
});

await test('an OpenAI-compatible reply that is cut off is reported, not finished', async () => {
  const oEnv = env({ PROVIDER: 'openai', MODEL: 'test-model', API_BASE: `${openai.url}/openai/v1` });
  const response = await proxy.fetch(request('/v1/chat', { body: chatBody('[cut]') }), oEnv);
  const events = parseEvents(await noKey(response));
  assert.ok(!events.some((e) => e.event === 'done'));
  assert.equal(events.at(-1).data.code, 'provider_stream_failed');
});

section('Page: streaming client (fake network, no server)');

const sseResponse = (frames, { status = 200, type = 'text/event-stream', pieces = 1 } = {}) => {
  const text = frames.join('');
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += pieces) controller.enqueue(bytes.slice(i, i + pieces));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { 'Content-Type': type } });
};
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const options = { maxTokens: 120, temperature: 0.8, topP: 0.92, frequencyPenalty: 0.4, presencePenalty: 0.2, stop: ['\nUser:'] };
const PROXY = 'https://velora-proxy.example.workers.dev';
const fast = { retryDelayMs: 1, stallMs: 150, connectAttempts: 3 };

await test('a streamed reply arrives piece by piece, and the status line is cleared at the first piece', async () => {
  const pieces = [];
  const statuses = [];
  const text = await streamOnlineReply(PROXY, [{ role: 'user', content: 'hi' }], options, {
    ...fast,
    fetchImpl: async () => sseResponse([frame('delta', { text: 'Hello ' }), frame('delta', { text: 'there.' }), frame('done', { finish: 'stop' })], { pieces: 5 }),
    onToken: (t) => pieces.push(t),
    onStatus: (s) => statuses.push(s),
  });
  assert.equal(text, 'Hello there.');
  assert.deepEqual(pieces, ['Hello ', 'there.']);
  assert.equal(statuses.at(-1), '');
});

await test('the request sent to the proxy carries the settings and no key', async () => {
  let sent = null;
  await streamOnlineReply(PROXY, [{ role: 'user', content: 'hi' }], options, {
    ...fast,
    fetchImpl: async (url, init) => {
      sent = { url, init };
      return sseResponse([frame('done', { finish: 'stop' })]);
    },
  });
  assert.equal(sent.url, `${PROXY}/v1/chat`);
  assert.equal(sent.init.method, 'POST');
  assert.ok(!JSON.stringify(sent.init).includes('key'), 'no key-like field in the request');
  const body = JSON.parse(sent.init.body);
  assert.equal(body.max_tokens, 120);
  assert.equal(body.top_p, 0.92);
  assert.equal(body.frequency_penalty, 0.4);
});

await test('when no connection can be made, it tries again, shows the status, then succeeds', async () => {
  let calls = 0;
  const statuses = [];
  const text = await streamOnlineReply(PROXY, [{ role: 'user', content: 'hi' }], options, {
    ...fast,
    fetchImpl: async () => {
      calls++;
      if (calls < 3) throw new TypeError('Failed to fetch');
      return sseResponse([frame('delta', { text: 'Back.' }), frame('done', { finish: 'stop' })]);
    },
    onStatus: (s) => statuses.push(s),
  });
  assert.equal(text, 'Back.');
  assert.equal(calls, 3);
  assert.ok(statuses.some((s) => /Trying again/.test(s)));
});

await test('when no connection can be made after every try, the person is told the proxy could not be reached', async () => {
  let calls = 0;
  await assert.rejects(
    streamOnlineReply(PROXY, [{ role: 'user', content: 'hi' }], options, {
      ...fast,
      fetchImpl: async () => { calls++; throw new TypeError('Failed to fetch'); },
    }),
    (err) => err instanceof OnlineError && err.code === 'network' && /could not reach/.test(err.message),
  );
  assert.equal(calls, 3);
});

await test('once the reply has started, a dropped connection is not retried (no duplicated text)', async () => {
  let calls = 0;
  const partial = [];
  await assert.rejects(
    streamOnlineReply(PROXY, [{ role: 'user', content: 'hi' }], options, {
      ...fast,
      fetchImpl: async () => {
        calls++;
        return sseResponse([frame('delta', { text: 'Half' })]); // no done event: cut off
      },
      onToken: (t) => partial.push(t),
    }),
    (err) => err.code === 'connection_lost' && /Tap regenerate/.test(err.message),
  );
  assert.equal(calls, 1);
  assert.deepEqual(partial, ['Half'], 'the part that arrived is shown once');
});

await test('a proxy error event is shown as a plain message with its code', async () => {
  await assert.rejects(
    streamOnlineReply(PROXY, [{ role: 'user', content: 'hi' }], options, {
      ...fast,
      fetchImpl: async () => sseResponse([frame('error', { code: 'blocked', message: 'x' })]),
    }),
    (err) => err.code === 'blocked' && /safety filter/.test(err.message),
  );
});

await test('an error response from the proxy is read as its code', async () => {
  await assert.rejects(
    streamOnlineReply(PROXY, [{ role: 'user', content: 'hi' }], options, {
      ...fast,
      fetchImpl: async () => new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'x' } }), { status: 429, headers: { 'Content-Type': 'application/json' } }),
    }),
    (err) => err.code === 'rate_limited',
  );
});

await test('a reply that stops arriving is ended as a timeout, not left waiting forever', async () => {
  const stuck = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(frame('delta', { text: 'One' })));
    },
  });
  await assert.rejects(
    streamOnlineReply(PROXY, [{ role: 'user', content: 'hi' }], options, {
      ...fast,
      stallMs: 60,
      fetchImpl: async () => new Response(stuck, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    }),
    (err) => err.code === 'timeout',
  );
});

await test('pressing Stop keeps the text that already arrived and does not raise an error', async () => {
  const controller = new AbortController();
  const stream = new ReadableStream({
    async pull(c) {
      c.enqueue(new TextEncoder().encode(frame('delta', { text: 'Partial' })));
      await new Promise((r) => setTimeout(r, 5));
      controller.abort();
    },
  });
  const text = await streamOnlineReply(PROXY, [{ role: 'user', content: 'hi' }], options, {
    ...fast,
    stallMs: 5000,
    signal: controller.signal,
    fetchImpl: async () => new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
  });
  assert.equal(text, 'Partial');
});

section('Mode rule and limits');

await test('online is used only when chosen, with an address, consent and a successful test', () => {
  const full = { chosen: true, proxyUrl: PROXY, consentAt: 1, verified: { at: 1 } };
  assert.equal(resolveAIMode(full), 'online');
  for (const key of Object.keys(full)) {
    const missing = { ...full, [key]: key === 'chosen' ? false : null };
    assert.equal(resolveAIMode(missing), 'offline', `without ${key} it must stay offline`);
  }
  assert.equal(resolveAIMode({ chosen: false, proxyUrl: '', consentAt: null, verified: null }), 'offline');
});

await test('online limits include every offline limit, and only raise the numbers that should grow', () => {
  for (const key of Object.keys(LIMITS)) assert.ok(key in ONLINE_LIMITS, key);
  assert.ok(ONLINE_LIMITS.maxHistoryMessages > LIMITS.maxHistoryMessages);
  assert.ok(ONLINE_LIMITS.maxMemories > LIMITS.maxMemories);
  assert.ok(ONLINE_LIMITS.memoryChars > LIMITS.memoryChars);
  assert.equal(ONLINE_LIMITS.summaryTokens, LIMITS.summaryTokens);
});

await test('the prompt keeps more recent messages online, and the offline default is unchanged', () => {
  const character = { name: 'Mira', systemPrompt: '', tagline: '', personality: '', backstory: '', scenario: '', exampleDialogue: '', customInstructions: '', ageGate: 'adult', traits: [] };
  const history = Array.from({ length: 36 }, (_, i) => ({ id: String(i), isFromUser: i % 2 === 0, text: `Message ${i}` }));
  const common = { character, history, memories: [], chatSummary: '', replyTokens: 180, lengthGuide: 'Short.' };
  const offlineDefault = buildChatMessages({ ...common, contextTokens: 4096 });
  const offlineExplicit = buildChatMessages({ ...common, contextTokens: 4096, limits: LIMITS });
  assert.deepEqual(offlineDefault, offlineExplicit, 'offline output must not change');
  const online = buildChatMessages({ ...common, contextTokens: ONLINE_LIMITS.contextTokens, limits: ONLINE_LIMITS });
  assert.ok(online.filter((m) => m.role !== 'system').length > offlineDefault.filter((m) => m.role !== 'system').length);
  assert.ok(online.some((m) => m.content.includes('Message 5')), 'older messages are kept online');
});

section('Project: no keys in the page or the public files');

await test('no real-looking API key appears anywhere in the project files', () => {
  const patterns = [/AIza[0-9A-Za-z_-]{30,}/, /sk-[A-Za-z0-9_-]{30,}/, /gsk_[A-Za-z0-9]{30,}/, /sk-ant-[A-Za-z0-9_-]{30,}/];
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        // tests/ holds a deliberately fake key that looks real, so that redaction is tested realistically.
        if (name === 'node_modules' || name === '.git' || name === 'tests') continue;
        walk(full);
      } else if (!/\.(png|jpe?g|gif|webp|ico)$/i.test(name)) {
        const text = readFileSync(full, 'utf8');
        if (patterns.some((p) => p.test(text))) offenders.push(relative(root, full));
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});

await test('the page does not write any key-like value to browser storage', () => {
  const pageFiles = ['js/ai/online.js', 'js/ai/mode.js', 'js/ui/views/online.js', 'js/core/sse.js'];
  for (const file of pageFiles) {
    const text = readFileSync(join(root, file), 'utf8');
    assert.ok(!/localStorage|sessionStorage/.test(text), `${file} must not use browser storage`);
    assert.ok(!/api[_-]?key/i.test(text) || /never|not store|no key/i.test(text), `${file} must not handle a key`);
  }
});

mock.close();
openai.server.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

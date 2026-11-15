// A fake Gemini server for tests. It copies the real Gemini streaming format (Server-Sent Events) so the
// proxy and the page can be tested end to end without a real key and without spending any quota.
// It does NOT prove that any real provider accepts the requests. Only a real key can do that.
//
// Behaviour depends on words in the last user message:
//   [429]  answers "rate limited"           [400]  answers a bad request that repeats the key back
//   [404]  answers "model not found"        [safety] answers with a safety block
//   [drop] streams part of a reply, then cuts the connection
//   [slow] waits 200 ms between pieces (used to test Stop)
//   anything else: streams a short roleplay reply in several pieces
// GET /__requests returns the bodies the proxy sent (used by the tests to check what is forwarded).
import http from 'node:http';

export function startMockGemini({ port = 0, expectedKey = 'test-key-123' } = {}) {
  const received = [];
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/__requests') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(received));
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    const urlPath = req.url.split('?')[0];
    if (req.method !== 'POST' || !/\/models\/[^/]+:streamGenerateContent$/.test(urlPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'mock: unknown route' } }));
      return;
    }
    if (req.headers['x-goog-api-key'] !== expectedKey) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'API key not valid' } }));
      return;
    }
    const body = JSON.parse(raw);
    received.push({ url: req.url, body, headers: { 'content-type': req.headers['content-type'] } });
    // Unanswered user messages are joined into one turn, so the behaviour words are read from the newest message only.
    const joined = [...(body.contents ?? [])].reverse().find((c) => c.role === 'user')?.parts?.[0]?.text ?? '';
    const lastUser = joined.split('\n\n').pop();
    const sendJSON = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    if (lastUser.includes('[429]')) return sendJSON(429, { error: { message: 'Quota exceeded' } });
    if (lastUser.includes('[404]')) return sendJSON(404, { error: { message: `models/x is not found; key ${expectedKey}` } });
    if (lastUser.includes('[400]')) return sendJSON(400, { error: { message: `Bad request, key ${expectedKey}` } });
    if (lastUser.includes('[safety]')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })}\r\n\r\n`);
      return res.end();
    }

    const pieces = lastUser.includes('[drop]')
      ? ['*Turns away slowly*', ' "I can', ' hear you."']
      : ['*Smiles and tilts her head*', ' "Tell me more about that.', ' I want to hear every part."', ' *Leans closer*'];
    const delay = lastUser.includes('[slow]') ? 200 : 15;

    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
    for (let i = 0; i < pieces.length; i++) {
      const frame = {
        candidates: [{ content: { role: 'model', parts: [{ text: pieces[i] }] }, index: 0 }],
      };
      // Split one frame in two to check that the proxy handles frames cut across network reads.
      const text = `data: ${JSON.stringify(frame)}\r\n\r\n`;
      const cut = Math.floor(text.length / 2);
      res.write(text.slice(0, cut));
      await new Promise((r) => setTimeout(r, 5));
      res.write(text.slice(cut));
      await new Promise((r) => setTimeout(r, delay));
      if (lastUser.includes('[drop]') && i === 1) {
        req.socket.destroy();
        return;
      }
    }
    const finalFrame = { candidates: [{ content: { role: 'model', parts: [{ text: '' }] }, finishReason: 'STOP', index: 0 }] };
    res.write(`data: ${JSON.stringify(finalFrame)}\r\n\r\n`);
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}/v1beta`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

// Run directly: node tests/mock-gemini.mjs 9100
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] || 9100);
  startMockGemini({ port }).then((m) => console.log(`Mock Gemini at ${m.url}`));
}

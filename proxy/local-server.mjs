// Runs the Velora proxy on your own computer. Use it to test online AI before you deploy the proxy,
// or to try the app on a PC browser. A phone cannot reach an address on your PC over plain http, so
// for the iPhone use a public proxy (see docs/ONLINE_AI_SETUP.md).
//
// Windows PowerShell example (run from the Velora folder):
//   $env:API_KEY = "paste-your-key-here"
//   $env:ALLOWED_ORIGINS = "http://localhost:8000"
//   node proxy/local-server.mjs
//
// Settings are read from environment variables only. This file never contains a key.
import http from 'node:http';
import { Readable } from 'node:stream';
import worker from './velora-proxy.js';

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
const MAX_BYTES = 200000;
const SKIP_REQUEST_HEADERS = new Set(['host', 'content-length', 'connection', 'keep-alive', 'transfer-encoding']);

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BYTES) {
        res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { code: 'payload_too_large', message: 'This chat is too long to send online.' } }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value !== undefined && !SKIP_REQUEST_HEADERS.has(name)) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const request = new Request(`http://${host}:${port}${req.url}`, {
      method: req.method,
      headers,
      body: hasBody && chunks.length ? Buffer.concat(chunks) : undefined,
    });

    const response = await worker.fetch(request, process.env);
    const outHeaders = {};
    response.headers.forEach((value, name) => { outHeaders[name] = value; });
    res.writeHead(response.status, outHeaders);
    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('The local proxy hit an unexpected error.');
  }
});

server.listen(port, host, () => {
  console.log(`Velora proxy is running at http://${host}:${port}`);
  console.log('Press Ctrl+C in this window to stop it.');
});

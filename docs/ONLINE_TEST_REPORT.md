# Online AI: what was tested (version 1.7.0)

This report says exactly what was run, what passed, and what was **not** tested. Online AI is **not** confirmed to work with a real AI provider. That needs one real test with your own key, following the steps in [ONLINE_AI_SETUP.md](ONLINE_AI_SETUP.md).

## Environment

- Build environment: Linux container, Node.js 22, headless Chromium (Playwright).
- No internet access to AI providers was available, and no provider key was available. Requests to real providers were therefore **not** made.
- A mock Gemini server (`tests/mock-gemini.mjs`) copies Gemini's streaming format. It is a test double, not the real service.

## Automatic tests that passed

| Suite | Command | Result |
|---|---|---|
| Logic tests (offline, unchanged) | `node tests/run-tests.mjs` | 150 passed, 0 failed |
| Static checks (imports, exports, icons, syntax) | `node tests/check-static.mjs` | 42 files checked, all passed |
| Online tests (parser, address check, proxy security and format, streaming client, mode rule, limits, no keys in files) | `node tests/run-online.mjs` | 41 passed, 0 failed |
| Offline browser test (the original suite, WebLLM stubbed) | `tests/browser-smoke.mjs` | 63 of 63 passed |
| Online browser test (real local proxy process, mock provider, phone-width Chromium) | `tests/browser-online.mjs` | 25 of 25 passed |

### What the online tests covered

- **Streaming.** Replies arrive piece by piece. Text is still growing while the provider is slow, and Stop keeps what has arrived.
- **Errors.** Rate limit, bad request, unknown model, wrong key, safety block, and a reply cut off by the connection. Each shows a plain message. A cut-off reply is never shown as complete.
- **Reconnection.** If no connection can be made, the page tries again (three tries, with growing waits). Once a reply has started, a dropped connection is not retried, so text is not duplicated. The next message works normally.
- **Stalls.** A reply that stops arriving for 45 seconds is ended as a timeout.
- **Security.** Only the listed web address can use the proxy. The key is never returned, never echoed in an error (a repeated key is redacted), never stored in browser storage, and never sent by the page. The project files contain no key-like values.
- **Request format.** The provider receives the character's instructions as system text, the roles converted for Gemini, the first turn from the user, same-speaker messages joined, the sampling settings, and the stop sequences. `max_tokens` is capped.
- **Input checks.** Oversized, malformed, or unknown-role requests are refused before anything is sent to the provider.
- **Mode rule.** Online is used only when chosen, with an address, consent, and a successful test.
- **Offline is unchanged.** The offline prompt is the same as before when no limits are passed. The offline browser suite passes in full.
- **Phone layout.** Setup, Profile, chat, Discover, Chats and Models have no sideways scrolling at 390 px wide.

## Not tested (please check these)

1. **A real AI provider.** No key and no network access to providers were available, so no real request was made. Run one test with your own key before you rely on Online AI.
2. **Real roleplay quality.** Whether Gemini (or another provider) keeps a character, flirts within the rules, avoids repeating itself, and remembers a long chat. This needs real conversations.
3. **Real provider filters.** Whether the provider's own safety filter blocks romance more often than expected. The mock never filters anything.
4. **iPhone Safari and iOS 26.** No iPhone was available. The layout was checked in Chromium at phone size, not in Safari. Streaming uses standard browser features that Safari supports, but this is untested on a device.
5. **A deployed Cloudflare proxy.** Only the local proxy was run. The Cloudflare steps in the setup guide are written from the documented process and have not been followed end to end.
6. **EU data use and availability.** Whether the free tier is available in your country, and which data policy applies, must be checked on the provider's own terms.
7. **Long-term memory quality with a real model.** The memory selection and summary code are the same as before, with higher limits for online mode. Their output with a real model is unmeasured.
8. **Quota behaviour over a day.** How quickly a free quota runs out during real use, including background memory notes, is unmeasured.

## How to run the tests yourself

```
npm test
npm run test:online-browser     (needs Playwright, see ONLINE_AI_SETUP.md)
```

# Online AI setup (Windows, beginner steps)

Velora can write replies with a hosted AI model instead of the model on your phone or PC. This is **optional**. Offline mode ("On this device") keeps working and stays the default.

Read this first:

- **Your chats leave your device in Online AI mode.** Each reply sends the character's details, the recent messages and the matching memories to the AI provider. Short memory notes written from long chats are sent too.
- **Your key must stay secret.** A key is like a password for your provider account. It goes only into your proxy's secret settings. Never paste it into Velora, GitHub, a chat with anyone (including Claude), a screenshot, or a file in the project.
- **This costs nothing if you stay on the free tier**, but this guide does not add any payment method. If a site asks you to add a card or pay for something, stop and ask first.

You need three things: a free Google account, a free Cloudflare account (for the public proxy that an iPhone can reach), and about 20 minutes.

---

## Part 1: Get a free Gemini API key

1. Open https://aistudio.google.com in your web browser and sign in with your Google account.
2. Open the API keys page (look for **Get API key** in the left menu, or go to https://aistudio.google.com/app/apikey).
3. Click **Create API key**. Choose a project if it asks. Google may create one for you.
4. Copy the key once. Keep it in a password manager, not in a text file inside the Velora folder.

If the page asks you to set up billing or add a payment method to create the key, **stop there**. Do not add one. The free tier is what this guide is written for. Ask for another free option instead.

Free-tier limits change, so check the limits in AI Studio before you rely on them. Free-tier content can be used by Google to improve its products. Read the terms before you send private chats. See [ONLINE_AI_PROVIDERS.md](ONLINE_AI_PROVIDERS.md) for the comparison.

---

## Part 2: Put the proxy online (Cloudflare Workers, free)

A proxy is a small piece of code that holds your key and forwards Velora's requests to Gemini. Velora's web page cannot hold a secret, so the proxy must run somewhere else. Cloudflare Workers gives a free public address that your iPhone can reach.

1. Go to https://dash.cloudflare.com and create a free account. Confirm your email.
2. In the left menu, open **Workers & Pages**, then click **Create**, then **Start with Hello World** (or **Create Worker**). Give it a name such as `velora-proxy`.
3. Click **Edit code**. Delete everything in the editor.
4. Open `proxy/velora-proxy.js` from the Velora folder in Notepad. Select all, copy, and paste it into the Cloudflare editor. (The file has no secret inside it. Your key goes in the next step.)
5. Click **Deploy**.
6. Open the Worker's **Settings**, then **Variables and Secrets** (the wording may differ slightly). Add these:

   | Name | Type | Value |
   |---|---|---|
   | `API_KEY` | **Secret** | the key from Part 1 |
   | `ALLOWED_ORIGINS` | Text | your Velora address, for example `https://yourname.github.io` (no path, no slash at the end) |
   | `PROVIDER` | Text | `gemini` |
   | `MODEL` | Text | `gemini-2.5-flash-lite` |

   Use **Secret** for `API_KEY`, so Cloudflare hides it after you save it.
7. Click **Deploy** again so the new settings apply.
8. Copy the Worker's address shown at the top of its page. It looks like `https://velora-proxy.yourname.workers.dev`.
9. Check it: open `https://velora-proxy.yourname.workers.dev/health` in a browser. You should see `"ok": true`. If you see `"ok": false` and a message, fix the setting it names.

Only the Velora address in `ALLOWED_ORIGINS` can use the proxy. Anyone who finds your proxy address and forges that address can still send requests, so treat your free quota as shared with anyone who has the address. Do not post the address publicly.

---

## Part 3: Connect Velora

1. Open Velora (on the PC in Chrome or Edge, or from your iPhone Home Screen).
2. Go to **Profile**, then **Set up online AI** (or open `#/online`).
3. Paste the Worker address from Part 2 step 8 into **Proxy address**. Tap **Save address**.
4. Tap **Test connection**. It asks the AI provider one tiny question. It uses a few tokens of your free quota. Velora shows the provider and model when it works.
5. Tick the box that says you understand chats are sent to the provider.
6. Tap **Use Online AI**.

Profile now shows **Online AI**, and each chat shows an **Online** badge. To go back, tap **On this device** on the Profile page. Nothing is deleted.

Velora will not switch to Online AI until the test has succeeded. If you change the proxy address, the test must pass again.

---

## Part 4 (optional): Test on your Windows PC first

This runs the same proxy on your PC. A phone cannot reach an address on your PC, so use this for testing only.

1. Install Node.js (version 18 or newer) from https://nodejs.org (choose the LTS button). Keep the default options.
2. Open the Velora folder in File Explorer. Click the address bar, type `powershell`, press Enter.
3. Set your settings for this window only. Replace the key text with your own key:

   ```powershell
   $env:API_KEY = "paste-your-key-here"
   $env:ALLOWED_ORIGINS = "http://localhost:8000"
   $env:PROVIDER = "gemini"
   $env:MODEL = "gemini-2.5-flash-lite"
   node proxy/local-server.mjs
   ```

   It should say `Velora proxy is running at http://127.0.0.1:8787`. Leave this window open.
4. Open a second PowerShell window in the same folder and start Velora:

   ```powershell
   py -m http.server 8000
   ```

5. Open Chrome or Edge at `http://localhost:8000`, go to **Profile**, then **Set up online AI**, and use the proxy address `http://localhost:8787`. Follow Part 3.
6. Press **Ctrl+C** in each window to stop them. Closing the window also stops the proxy, and the key is forgotten when the window closes.

Do not put your key in a file in the project. `.gitignore` blocks `.env` files, but the safest place is the environment variable above.

---

## If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| "Velora could not reach your online AI proxy" | The address is wrong, the proxy is off, or there is no internet | Check the address, open `/health` in a browser, check the connection |
| "The proxy does not allow this web address" | `ALLOWED_ORIGINS` does not match this page exactly | Use `https://yourname.github.io` with no path and no slash at the end |
| "The online proxy is not set up yet. The API_KEY secret is missing" | The key is not saved in the proxy settings | Add `API_KEY` as a Secret (Part 2 step 6), then Deploy again |
| "did not accept the key" | The key is wrong, or it was made for a different service | Create a new key in AI Studio and update the secret |
| "model name ... was not found" | `MODEL` is not a model the provider offers | Use `gemini-2.5-flash-lite` or `gemini-2.5-flash` |
| "free limit has been reached" | The free quota is used up for now | Wait, or use On this device |
| "safety filter stopped this reply" | The provider's own filter blocked the reply | Try a different message. This is the provider's rule, and Velora cannot turn it off |
| "connection stopped before the reply finished" | The network dropped mid-reply | Tap regenerate. The part already shown is kept |

---

## Keep your key safe

- If you think your key was seen by someone else, go to AI Studio, delete that key, create a new one, and update the `API_KEY` secret.
- Do not put the key in `index.html`, `js/`, a GitHub repository, a screenshot or a support message.
- Velora's web page never receives the key. You can check this with the browser's developer tools (Network tab): the requests contain your chat text, but never the key.

---

## For developers

From the project folder (Node.js 18+):

```
npm test
```

runs the offline logic tests, the static checks, and the online-mode tests. The online tests use a mock provider, so they need no key and use no quota.

The optional end-to-end browser test needs Playwright (`npm i -D playwright`, then `npx playwright install chromium`). It starts the real local proxy and the mock provider, and drives Chromium at phone width:

```
npm run test:online-browser
```

These tests do **not** call a real provider. Only a real key and a real provider can confirm that Online AI works. See [ONLINE_TEST_REPORT.md](ONLINE_TEST_REPORT.md) for what has and has not been tested.

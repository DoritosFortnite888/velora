# Velora

Velora is a free website that works like an app. You chat with AI characters, and the AI runs **on your own device**. It does not use any paid API, cloud model, or account. It installs to your iPhone's Home Screen without an App Store or an IPA file.

> **Honest status:** the app code is complete, and its logic and screens are tested automatically (see [docs/LIMITATIONS.md](docs/LIMITATIONS.md)). **The real on-device model has not yet been run on an iPhone 14**, so offline AI is not yet proven. Please run the test in [docs/IPHONE_INSTALL.md](docs/IPHONE_INSTALL.md) and report what happens.

## What you get

- **Discover**: browse characters, search them, filter by tag, and create or import your own.
- **Character profiles**: name, picture, description, personality, background, opening line and scenario.
- **Create and edit** characters, with a picture, a roleplay style and advanced fields.
- **Import character cards**: JSON (V1 and V2), PNG cards with embedded data, and pasted text.
- **Chats**: streaming replies, stop, regenerate, history, and each chat saved on your device.
- **Memories**: notes about you and your shared history. Velora also writes new notes after longer chats.
- **Roleplay styles**: Balanced, Playful, Gentle, Dramatic or Direct, for each character.
- **Offline support**: the website is saved after one online visit. The model is downloaded once and then kept on your device.
- **Backups**: export and import everything from the Profile page.

## Rules that always apply

- Romance and flirting are allowed **only** with characters confirmed as 18 or older. You confirm this yourself on the character's profile page.
- Characters whose text suggests someone under 18 (for example "16 years old", "sixteen years old" or "high school") are blocked. This is a cautious keyword check, so it can flag an adult. Edit the text to fix it.
- Sexual content is never written. Intimate moments fade out.
- The character says it is an AI if someone sincerely asks.

## Files in this project

```
index.html              The page shell and bottom navigation
manifest.webmanifest    Name, icons and "install as app" settings
sw.js                   Service worker: saves the website for offline use
css/styles.css          The dark, mobile-first design
js/app.js               Router and startup
js/core/                Pure logic: safety rules, prompts, card import, examples
js/data/db.js           Saves characters, chats and memories in IndexedDB
js/ai/                  Device checks, WebLLM engine, model downloads, chat logic
js/ui/                  Screens and shared helpers
icons/                  Velora's original icons (made by scripts/make_icons.py)
tests/                  Automatic tests (run with npm test)
docs/                   GitHub Pages guide, iPhone guide, limitations
```

No model files are in this project. The `.gitignore` also blocks them (`*.gguf`, `*.bin`, and so on).

---

## Part 1: Try it on Windows (beginner steps)

You only need a web browser to use Velora. These steps are for putting it online and, optionally, testing it on your PC first.

### Step 1: Get the files

1. Unzip `Velora.zip` into a folder you can find, such as `Documents\Velora`.
2. Open that folder. You should see `index.html`, `sw.js` and a folder called `js`.

### Step 2 (optional): Test on your PC

1. Install Python from https://www.python.org/downloads/ . On the first screen, **tick "Add python.exe to PATH"**, then click Install.
2. Open the Velora folder in File Explorer. Click the address bar, type `powershell`, and press Enter. A blue window opens in that folder.
3. Type this and press Enter:
   ```
   py -m http.server 8000
   ```
4. Open **Google Chrome** or **Microsoft Edge** and go to `http://localhost:8000`.
5. Use the Profile page to check the device. Chrome or Edge on a PC with a recent graphics card usually passes.
6. To stop the test, go back to the blue window and press **Ctrl+C**.

Do not double-click `index.html`. Velora needs to run through a web address, not a file, for its offline features to work.

### Step 3: Put Velora on GitHub Pages (free hosting)

You do not need to install Git. You can upload the files through the GitHub website.

1. Create a free account at https://github.com if you do not have one.
2. Click **+** (top right) > **New repository**.
3. Name it `velora`. Choose **Public**. Click **Create repository**.
4. On the new repository page, click **uploading an existing file**.
5. Open the `Velora` folder on your PC, press **Ctrl+A** to select everything inside it (the files and the `js`, `css`, `icons`, `docs`, `scripts` and `tests` folders), and drag them onto the GitHub page.
6. Wait for the uploads to finish. Scroll down, then click **Commit changes**.
7. Click **Settings** (top of the repository page) > **Pages** (left menu).
8. Under **Build and deployment**, set **Source** to **Deploy from a branch**. Set **Branch** to **main** and the folder to **/ (root)**. Click **Save**.
9. Wait 1 to 3 minutes, then refresh the Pages page. It shows your address, for example `https://YOURNAME.github.io/velora/`.
10. Open that address on your PC to check that Velora loads.

For more detail, see [docs/GITHUB_PAGES.md](docs/GITHUB_PAGES.md).

### Step 4: Update Velora later

Upload the changed files on GitHub again (the same way) and click **Commit changes**. Then close and reopen Velora. Your characters and chats stay on your device.

---

## Part 2: Put it on your iPhone

The full guide is [docs/IPHONE_INSTALL.md](docs/IPHONE_INSTALL.md). In short:

1. Open your GitHub Pages address in **Safari**, on iOS 26 or later.
2. Go to **Profile** and check the device report. If it says the GPU is missing, follow the note it gives.
3. On a Wi-Fi connection, tap **Download model**. Keep the screen on until it finishes.
4. Tap the Share button, then **Add to Home Screen**.
5. Open Velora from the Home Screen icon. On iOS, the Home Screen app may keep its own storage, so check the Profile page there. If it says the model is not downloaded, download it again from inside the Home Screen app.

## Part 3: Developers

Run the automatic tests from the project folder (needs Node.js 18 or newer):

```
npm test
```

This runs the logic tests, and a check that every import and icon name exists.

The optional browser test opens Velora in Chromium and goes through the main flows. It replaces the AI library with a small stub, so it tests Velora's own chat logic, not a real model:

```
npm i -D playwright
npx playwright install chromium
BASE_URL=http://127.0.0.1:8000/index.html node tests/browser-smoke.mjs
```

To change the model, edit `MODELS` in `js/core/config.js`. The model ids must match the WebLLM prebuilt list for `WEBLLM_VERSION`.

To regenerate the icons, install Pillow (`py -m pip install pillow`) and run `python scripts/make_icons.py`.

## Licences of what Velora uses

- **WebLLM** (`@mlc-ai/web-llm`, loaded from a CDN): Apache 2.0.
- **Qwen2.5 0.5B Instruct** (the default model, downloaded on your device): Apache 2.0.

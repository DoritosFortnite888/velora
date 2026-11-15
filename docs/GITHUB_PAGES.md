# Deploying Velora to GitHub Pages

GitHub Pages hosts Velora for free over HTTPS. HTTPS matters: WebGPU, the service worker and offline storage only work over HTTPS (or on `localhost`).

## Requirements

- A free GitHub account.
- The Velora files (everything inside the `Velora` folder, not the folder itself).

## Option A: Upload through the website (no tools needed)

1. Go to https://github.com/new.
2. Repository name: `velora`. Visibility: **Public** (GitHub Pages is free for public repositories).
3. Click **Create repository**.
4. Click **uploading an existing file**.
5. Drag the **contents** of your Velora folder into the page. Make sure `index.html`, `sw.js`, `manifest.webmanifest`, `.nojekyll` and the `js`, `css`, `icons`, `docs`, `scripts` and `tests` folders are included.
   - `.nojekyll` is a file with no name before the dot. Some file browsers hide it. In File Explorer, enable **View > Show > Hidden items**.
6. Click **Commit changes**.
7. Go to **Settings > Pages**.
8. Under **Build and deployment**, choose **Source: Deploy from a branch**, **Branch: main**, **Folder: / (root)**, then **Save**.
9. Wait a few minutes. The address appears at the top of the Pages page: `https://YOURNAME.github.io/velora/`.

## Option B: Use Git (for later updates)

```
git clone https://github.com/YOURNAME/velora.git
cd velora
# copy the new Velora files into this folder
git add .
git commit -m "Update Velora"
git push
```

GitHub Pages rebuilds the site automatically after each push.

## Checks after deploying

- Open the address in Chrome or Edge on a PC. The Discover page shows Kai, Mira and Nova.
- Open the Profile page. The device report appears.
- Open DevTools (F12) > Console. There should be no red errors.

## Notes

- Do **not** upload any `.gguf`, `.bin` or other model files. The model is downloaded in the browser instead. `.gitignore` blocks these types, but check before you commit.
- The site runs from a subfolder (`/velora/`), so every link and file path in Velora is relative. Do not add paths that start with `/`.
- If you change the Velora version number, GitHub Pages refreshes within a few minutes. Browsers may keep an older copy until you close and reopen the app.

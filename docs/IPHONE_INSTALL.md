# Installing Velora on iPhone 14 (iOS 26)

Velora is a web app. You do not need the App Store, an IPA file, or a developer account.

Work through the steps in order. Where a step says **test**, do it, and note what happens. Velora's offline AI has not yet been tested on a real iPhone, so your results matter.

## Before you start

- An iPhone 14 with **iOS 26** or later. Check in Settings > General > About.
- **Safari**. Use Safari, not Chrome or other browsers on iPhone, because WebGPU support depends on Safari.
- Wi-Fi, and enough free storage for the model download (at least 1 GB free is a safe amount).
- The Velora address from GitHub Pages, for example `https://YOURNAME.github.io/velora/`.

## Step 1: Open Velora in Safari

1. Type the address in Safari and open it.
2. Discover should show Kai, Mira and Nova.

## Step 2: Check WebGPU

1. Tap **Profile** (bottom right).
2. Look at **On-device AI**.
   - If it says the device passes the checks, go to Step 3.
   - If it says WebGPU is not available, the Safari setting is probably off. Go to **Settings > Apps > Safari > Advanced**, look for a WebGPU or experimental feature setting, and turn it on. Fully close Safari (swipe up from the bottom and swipe the Safari card away), then open Velora again.
   - If it says the graphics adapter could not be found, that is a limit of this iPhone's Safari. Velora cannot run the model in that case, and it says so rather than pretending.

## Step 3: Download the model (once, on Wi-Fi)

1. On the Profile page, tap **Download model**.
2. Keep Velora open and the screen on until the progress bar finishes. Do not switch apps.
3. When it says "Downloaded and loaded in memory", the model is ready.
4. **Test:** tap **Delete model files**, then download it again. Note how long it takes.

If the download fails, the message explains why (for example, no connection, or the library could not load).

## Step 4: Add Velora to your Home Screen

1. In Safari, tap the **Share** button (the square with an arrow pointing up).
2. Scroll the list of actions if needed, and tap **Add to Home Screen**.
3. Keep the name **Velora** and tap **Add**.
4. Close Safari and open Velora from its new icon. It opens full screen, without the Safari address bar.

**Storage note:** on iOS, an app added to the Home Screen may keep its own storage separate from Safari. Go to the Profile page inside the Home Screen app. If it says the model is not downloaded, tap **Download model** there.

## Step 5: Test offline use (only after Steps 3 and 4)

1. Open Velora from the Home Screen and go to a character.
2. Start a chat, send a message, and get a reply. This confirms the model works online.
3. Turn on **Airplane Mode** (Control Centre). Also turn Wi-Fi off, to be certain.
4. Close Velora completely: swipe up and hold, then swipe the Velora card away.
5. Open Velora again. It should open.
6. Open a chat and send a message. A reply should appear.

Record the result. If the reply appears, offline chat works on your iPhone. If not, note the exact message shown.

## Step 6: Check that your data stays

1. Close Velora fully and reopen it. Your characters and chats should still be there.
2. Go to Profile > Storage and backup > **Export backup**. Keep the file in Files.
3. Use **Ask Safari to keep my data**. Safari may or may not agree.

## Troubleshooting

| What you see | What to try |
|---|---|
| "WebGPU is not available" | Safari setting (Step 2), then fully close and reopen Safari |
| "not enough memory" while loading | Close other apps, restart the iPhone, then try again |
| Replies stop when you switch apps | Stay in Velora while a reply is being written. iOS may stop background work. |
| Model "not downloaded" after a while | iOS may clear website data when space is low. Download it again. |
| Page does not open offline | Open the Velora address once while online, then try again |
| Replies are slow or very short | Expected from a small 0.5B model. Patience is needed. |

## Please report back

Note these results and share them with the person who built Velora:

- iOS version and iPhone model
- Did the device check pass? Which message appeared, if any?
- How long did the model download take?
- Did offline chat work (Step 5)?
- How many seconds did the first reply take, and roughly how fast did it stream?
- Any error messages, exact wording

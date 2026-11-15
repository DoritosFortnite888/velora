# Limitations and test status

## What has been tested, and how

| Area | Status | How it was checked |
|---|---|---|
| Card import (JSON V1/V2, PNG tEXt and iTXt, pasted text) | Automatically tested | `npm test` |
| Age check (digits, spelled-out ages, school words) | Automatically tested | `npm test` |
| Prompt size limits and safety rules inside prompts | Automatically tested | `npm test` |
| Example and starter characters | Automatically tested | `npm test` |
| Imports, exports, icon names, syntax of every file | Automatically checked | `tests/check-static.mjs` |
| Screens, navigation, creating and importing characters, memories, backup, erase | Tested in Chromium (phone-sized) | `tests/browser-smoke.mjs` |
| Chat streaming, stop, regenerate, memory notes, persistence across reload | Tested in Chromium **with a stub AI library** | `tests/browser-smoke.mjs` |
| Website opens offline after one online visit | Tested in Chromium (service worker) | `tests/browser-smoke.mjs` |
| Clear message when the AI library cannot be downloaded | Tested in Chromium (offline sandbox) | `tests/browser-smoke.mjs` |
| Roleplay prompts (style guide, traits, romance level, reply length) | Automatically tested | `npm test` and `tests/browser-smoke.mjs` |
| Message rendering: actions, speech, HTML escaping, cleanup of replies | Automatically tested | `npm test` and `tests/browser-smoke.mjs` |
| Migration of characters saved by v1.0 | Automatically tested | `npm test` |
| **Real WebLLM model running in a browser** | **Not tested** | — |
| **Real model on iPhone 14 with iOS 26 Safari** | **Not tested** | — |
| **Offline AI on iPhone** | **Not tested** | Follow docs/IPHONE_INSTALL.md |
| **Real model on Windows Chrome or Edge** | **Not tested** | — |

The stub AI library in the browser test returns fake replies. It proves Velora's chat logic works, but it says nothing about how the real model behaves or how fast it runs.

## Roleplay and adult content (v1.1)

- **The rules are instructions, not guarantees.** Velora writes its rules into every prompt. A small model may still ignore them, drift from a character, or write something you did not want. Use **Regenerate**, edit the character, or stop the scene.
- **Romance needs an adult and an age.** The character must be confirmed as 18 or older, with an age of 18 or more on record. An unclear or missing age keeps romance off.
- **The keyword age check is cautious.** It can flag an adult, and it cannot verify anyone's age.
- **Reply length is a budget, not a promise.** Short replies are limited by a token budget. A model may still write a sentence that is cut off, or run long.
- **Stop sequences depend on the library.** Velora asks the model to stop before it writes the user's lines. Velora also removes leaked labels after the reply. Neither is guaranteed on every model.
- **Action formatting depends on the model using asterisks.** Velora shows *asterisk actions* in italics. If a model writes actions some other way, they appear as normal text.
- **Velora cannot stop a model from narrating your actions.** Its style guide asks the model not to, but it may still do it.

## Known limitations on iPhone (Safari)

1. **WebGPU needs iOS 26 and a Safari that offers it.** Older iOS versions cannot run the model. The Profile page explains this.
2. **Memory is limited per tab.** iOS may stop a tab or app that uses too much memory, especially while other apps are open. A reply may stop partway. Velora keeps the partial reply.
3. **Background work stops.** When you switch away from Velora during a reply, iOS may pause it. Stay in the app while a reply is being written.
4. **Storage can be cleared.** Safari may clear website data (including the model and chats) when storage is low, or after long periods without use. Use **Export backup** regularly. The Home Screen app may use separate storage from Safari.
5. **Storage permission is not guaranteed.** "Ask Safari to keep my data" is a request, and Safari decides.
6. **Downloads are large.** The model needs a few hundred megabytes or more. Use Wi-Fi.
7. **The downloaded files are cached by the AI library.** Velora cannot see inside that cache, so it relies on the library and on the model-ready flag. If iOS removes the files, Velora downloads them again the next time you chat, and that needs an internet connection.
8. **Export downloads open in the share sheet on iPhone**, where you can save to Files.
9. **The GPU limits may be lower than the model needs.** Velora checks GPU limits before the download, but these checks are estimates.
10. **iOS does not report RAM to web pages.** Velora cannot measure iPhone memory, so it relies on the GPU limits instead.

## Limitations on Windows

- Use **Google Chrome** or **Microsoft Edge**, on a PC with a recent graphics card and hardware acceleration on. Other browsers may not offer WebGPU.
- Velora must run over `https://` (GitHub Pages) or `http://localhost`. Opening `index.html` directly from a folder will not work.

## Limitations of the app itself

- **The model is small.** The default, Qwen2.5 0.5B, follows characters and keeps simple conversations going. It will not match larger online models for depth, memory or detail.
- **Replies can repeat themselves, drift from the character, or stop mid-sentence.** Use **Regenerate**, or edit the character's instructions.
- **The age check is a cautious keyword scan.** It cannot verify anyone's age. It can flag adults who mention ages or school in a character's text. The rule that romance is only for people you have confirmed as adults depends on you.
- **Lorebook entries** in imported cards are noted, but not imported.
- **Memory notes** are written by the same small model, so they may be incomplete or occasionally wrong. You can edit or delete them on the Memories page.
- **There is no sync** between devices. Use Export backup and Import backup to move data.
- **The AI library and the model are loaded from the internet the first time.** After that they are kept on the device, subject to the limits above.
- **No notifications, accounts or cloud features.** This is intentional.

## Privacy

- Conversations are stored only in your browser on your device.
- Velora has no analytics and sends no chat text anywhere. The only network requests are the page files, the AI library, and the model download.

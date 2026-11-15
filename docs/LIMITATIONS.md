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

## Version 1.6.0: LFM2.5 1.2B candidate

**Read this first.** LFM2.5 1.2B Instruct is **not offered** in this build. Nothing was downloaded, loaded or generated, because the build environment had no internet access. No iPhone 14, iOS Safari or WebGPU compatibility is claimed.

- **The runtime is unknown.** Whether the pinned WebLLM 0.2.79 has a build for this architecture was not checked. The verifier is the check, and it must be run with internet access.
- **The model's details were not confirmed here.** The repo id in the config is a guess. The licence is a custom one, and it has not been read.
- **Memory and speed are estimates or unknown.** The 960 MB figure is a rough extrapolation from Llama 3.2 1B, not a measurement.
- **Roleplay quality and long-conversation consistency are untested.** The phone test plan in `docs/LFM25_INTEGRATION.md` is for you to run.
- **The verifier's success path is untested.** It depends on the npm tarball layout and the Hugging Face API response, which can only be checked with network access.

### What was tested for version 1.6.0

| Area | How it was checked |
|---|---|
| Candidate stays out of the download list and automatic choice | `npm test` (automatic) |
| Size arithmetic and the Llama 1B recommendation are unchanged | `npm test` (automatic) |
| Verifier helpers: needle search, file summary, verdict | `npm test` (automatic) |
| Verifier failure path (no network): reports and exits 1 | Run manually in this build |
| Candidate visible but not downloadable on the Models page | `tests/browser-smoke.mjs` (headless Chromium, stub model) |
| **Verifier success path (WebLLM package, Hugging Face repo)** | **Not tested. Needs network.** |
| **LFM2.5 download, load or reply** | **Not tested.** |
| **LFM2.5 roleplay quality and long conversations** | **Not tested.** |
| **LFM2.5 on iPhone 14, iOS Safari, WebGPU** | **Not tested. No compatibility is claimed.** |

## Version 1.5.0: OpenAI GPT investigation and automatic choice

**Read this first.** This environment had no internet access. No model was downloaded, no model list was read, and no runtime was run, so none of the model claims below are measured. The sizes are arithmetic, and the rest comes from published facts recalled from memory. Those are marked in `docs/OPENAI_GPT_INVESTIGATION.md`.

- **No OpenAI GPT model can run on iPhone 14 in Velora.** GPT-OSS 20B needs about 10.6 GB for its weights alone, against a 1.2 GB iPhone budget. This is a firm conclusion from arithmetic, not a test.
- **The GPT-2 family is genuine but not usable for roleplay.** It was not trained to hold a character, and no runtime Velora uses has a verified build.
- **Automatic choice is tested in logic and in a stub browser,** not on a phone. It depends on the device checks, which cannot read iPhone RAM.
- **The `quality` ordering is an estimate**, based on model size and general reports. It is not a measurement of conversation quality.
- **The iPhone budget (1,200 MB) is an estimate.** A Safari tab's real limit is not known.

### What was tested for version 1.5.0

| Area | How it was checked |
|---|---|
| Size arithmetic | `npm test` (automatic) |
| Automatic choice: picks only downloaded models, iPhone and computer rules, skip reasons | `npm test` (automatic) |
| Stored choices: manual stays manual, fresh installs are automatic | `npm test` (automatic) |
| No GPT-labelled model is offered; investigated models are not downloadable | `npm test` (automatic) |
| Automatic-choice panel, switching back on, Selected tag | `tests/browser-smoke.mjs` (headless Chromium, stub model) |
| **GPT-OSS 20B download, load or reply on any device** | **Not possible here. Not tested.** |
| **Real model: Llama 3.2 1B or Qwen2.5 0.5B on iPhone 14** | **Not tested.** |
| **Offline use after a download, on iPhone 14** | **Not tested.** |

## Version 1.4.0: speed, reliability and model limits

**Read this first.** Nothing in this version has been run on a phone, and this environment had no network, so the model could not be downloaded or benchmarked here. The only real browser runs used a stub model. What was checked is listed below. For real numbers, use the speed test on Profile, and tell us what you see.

### What was changed, and what was measured
- **Replies are not held back by memory work.** Measured with a stub model in headless Chromium: the original build paused for 982 and 1300 ms after some replies because memory and summary work ran first. The new build stayed at about 617 ms, the stub's own streaming time. On a phone, where a summary can take several seconds, the effect should be bigger. This is an inference from the code path, not a device measurement.
- **Background work cannot starve.** A quick reply no longer cancels a summary in progress. The browser test found that bug, and it is fixed.
- **Time to first word and writing speed are recorded** for each reply, and for the speed test. They are estimates: writing speed counts streamed pieces, which are about one token each but not exactly.
- **The prompt is split into a stable part and a changing part.** About two-thirds of a typical system prompt is identical from turn to turn. Whether WebLLM reuses that cached start has **not been measured**.
- **The 3B model is refused on iPhone** before any download starts. Velora has no measurement of the device's real memory, so this is based on WebLLM's own figure and third-party reports.

### What was not done, and why
- **No benchmark of Qwen against Llama on iPhone 14.** The sandbox could not download the models or reach a phone. The default model and the recommended model are unchanged, and they remain untested on an iPhone 14.
- **No measured speed on iPhone 14.** The first-word delay is still mostly prompt reading, which was not measured. The stub shows that the app's own code no longer adds delay after a reply.
- **No CPU (WASM) fallback.** WebLLM runs only on WebGPU. It has no WASM inference path to optimise. A CPU fallback would need a different runtime, which has not been evaluated.
- **The WebLLM library is still loaded from a CDN** the first time. The service worker keeps it after that, so it works offline once it has been loaded once. Bundling it inside the project would need network access to fetch it, which was not available here.
- **Model files are still fetched by WebLLM from the model host** (and its model library from its own host). Velora's service worker does not cache these. WebLLM stores them in browser Cache Storage, under a name the app's cache clearing does not touch. Offline use after a download has **not been tested on an iPhone**.
- **OPFS versus IndexedDB on iOS was not tested.** Velora keeps its data in IndexedDB, and WebLLM keeps model files in Cache Storage. Safari may clear script-writable storage after a period without use, as far as we know. Export a backup regularly.
- **Relationship progression and event tracking are not new.** Memories and the rolling chat summary carry events. No separate relationship stage was added, because it would need a rule for how the relationship changes.
- **The specialist systems are small JavaScript rules, not separate models.** They are: the situation reader and the physical-action reader (`js/core/reactions.js`), the memory selection (`js/core/memory.js`), the scene and continuity rules (`js/core/persona.js`), and the action formatter (`js/core/format.js`). Their effect on reply quality has not been measured.
- **No fine-tuning.** A fine-tune would need a training run on a computer with a suitable GPU, a large set of good roleplay examples, a licence check on the base model, and a quantization step for WebGPU. None of that was attempted or tested here, and prompts are not training.

### Test status for 1.4.0

| Area | How it was checked |
|---|---|
| Background queue order and failure handling | `npm test` (automatic) |
| Timing maths and the speech check | `npm test` (automatic) |
| The 3B block on iPhone, and not on a computer | `npm test` and the browser test (automatic) |
| The stable prompt start is identical across turns | `npm test` (automatic) |
| Stop during the wait, the speed test, and the iPhone block in a real browser | `tests/browser-smoke.mjs` (headless Chromium, stub model) |
| Reply unlock time, original versus new | Browser stub measurement, as above |
| **Real model: speed, time to first word, writing speed** | **Not tested.** Use Profile > Speed. |
| **Real model: Qwen versus Llama quality** | **Not tested.** |
| **Real model on iPhone 14, including the 1B model** | **Not tested.** |
| **Offline use after a download, on iPhone 14** | **Not tested.** |
| **Whether WebLLM reuses the cached prompt start** | **Not tested.** |

## Version 1.3.2: immersive roleplay

**Read this first.** These changes shape what the model is asked to do. They do not change the model. Nothing here has been checked on a real model, so how well a model keeps actions, reacts to physical moves, or remembers a scene over a long chat is not proven.

- **Actions are requested, not forced.** Each reply's direction asks for at least one action in asterisks. A small model may still leave the action out, or write it in another form. Velora does not add an action to a reply that lacks one.
- **Physical moves are detected by word patterns.** A move written in other words, such as "I snatch at your fingers", may be read as neutral, and the model then reacts from the wording alone.
- **Scene memory is in the prompt, not stored.** The model is asked to keep track of positions and held objects using the chat it can see. Only the recent messages and the summary are available, so a detail from far back may be lost.
- **Fights are kept non-graphic by instruction only.** A small model may still write more violence than intended. Use Regenerate, or edit the character's instructions.
- **The real-concern markers are still a short list**, as in 1.3.1. A real threat written without a marker may be read as fiction.

### What was tested for version 1.3.2

| Area | How it was checked |
|---|---|
| Hugging, holding or grabbing a hand, punching, kicking, shoving, running, walking off, sitting down | `npm test` (automatic) |
| Physical moves are not read as threats or real concerns (unless a real-world marker is present) | `npm test` (automatic) |
| Touch follows the romance rule (friendly or within the romance level) | `npm test` (automatic) |
| Action line present for every kind of message | `npm test` (automatic) |
| Repeated opening actions are varied; the action is kept | `npm test` (automatic) |
| Prompt still fits the small-window test, with the safety rules last | `npm test` (automatic) |
| **Real model acting on a grab, hug, punch, run or fight in character** | **Not tested.** |
| **Real model keeping an action in almost every reply over a long chat** | **Not tested.** |
| **Real model remembering positions and held objects through a chat** | **Not tested.** |

## Version 1.3.1: natural roleplay

**Read this first.** These changes shape what the model is asked to do. They do not change the model itself. A small model can still ignore instructions, write generic replies, or repeat itself. Nothing in this version has been scored on a real model, so the roleplay quality is not proven.

- **What changed in the prompt.** The character comes first. A short scene section says that dramatic lines are fiction. The style guide is positive now, with one format example that the model is told not to copy. Each reply gets short direction: what the user's latest message means in the scene, how the character's traits show, and what the recent replies already used. The safety rules are still last.
- **Situation detection is word-based.** It reads patterns such as "I'm going to eliminate you" or "I'm scared". It can miss a message that says the same thing in other words, and it can misread a sentence. A misread only changes the direction the model is given, but it can still cause a wrong reaction.
- **Real-world concerns are flagged by simple markers.** A threat or insult is treated as a real concern when violent words appear with a real-world marker, such as "for real", "in real life", "irl", "I know where you live", or a named real person ("my boss"). A message about ending one's life is always treated as a real concern. The marker list is short, so a real threat written without these words may be treated as fiction. Velora is not a safety service. If someone may be in danger, they should contact local emergency services.
- **Repetition avoidance uses the last four replies.** It lists recent actions and verbs, and the opening words used in the last three replies. It cannot stop a model from repeating a phrase it was not shown, and it cannot make a model follow the list.
- **Formatting fixes run on every reply.** Dialogue inside asterisks is moved out, and short action phrases in brackets such as (looks away) are changed to italics. Ordinary words in brackets are left alone. The fixes are small and do not change the meaning, but they are not a full parser.
- **Protections are kept, in fewer words.** The adult rules still ban sexual content, anyone under 18, and pressure on the user. The rules about the user's pace are now written as limits, not lectures. Friendly mode is no longer described as "friendly" in a way that softens anger or sadness. Romance is still limited to confirmed adults.
- **Prompt size.** The system prompt is about 1,300 tokens for a starter character, within the 4,096-token window. The chat history that fits is smaller than before, by a few hundred tokens.

### What was tested for version 1.3.1

| Area | How it was checked |
|---|---|
| Identity line first, scene framing, real-world exception, safety rules kept | `npm test` (automatic) |
| Situation detection for threats, insults, anger, fear, sadness, affection, surprise, playful, confusion, questions, neutral | `npm test` (automatic) |
| Dramatic threats stay in the story; sincere threats and self-harm lines are flagged | `npm test` (automatic) |
| Personality reactions differ between characters | `npm test` (automatic) |
| Recent actions, verbs and openings are listed to be avoided; no note on the first reply | `npm test` (automatic) |
| Action and speech formatting fixes | `npm test` (automatic) |
| Imports, exports, icon names and syntax | `tests/check-static.mjs` (automatic) |
| **Real model reacting in character to threats, sadness, insults or jokes** | **Not tested.** |
| **Real model avoiding repeated actions over a long chat** | **Not tested.** |
| **Real model keeping a trait over many replies** | **Not tested.** |
| **Real model on iPhone 14** | **Not tested.** |

## Version 1.3: models, chat summaries and no artificial waiting

**Read this first.** No model in this version has been run on an iPhone 14 by this project, and the figures below come from WebLLM's own published memory numbers and third-party reports. The most useful evidence we found is a third-party report of an iPhone 11 Pro Max on iOS 26-era Safari: Qwen2.5 1.5B failed to load after downloading, and Llama 3.2 1B reached generation before Safari reloaded the page mid-reply. Those results suggest that a 1B model is at the edge of what an iPhone can run, and that the 3B model is likely out of reach. We have not reproduced those results ourselves.

- **Models.** The default stays Qwen2.5 0.5B so existing installs keep working. Llama 3.2 1B is marked as the best fit for an iPhone 14, and Llama 3.2 3B as likely too large. Both Llama models are under the Meta Llama 3.2 Community License. Their WebLLM ids (`Llama-3.2-1B-Instruct-q4f16_1-MLC`, `Llama-3.2-3B-Instruct-q4f16_1-MLC` and their q4f32 builds) appear in third-party copies of WebLLM's prebuilt list. They were not checked against the exact 0.2.79 build this project pins, so the app still checks each id before downloading and explains a missing one. WebLLM's latest release at the time of writing was newer than the pinned 0.2.79. The pin was kept, so an update cannot change behaviour without a test.
- **Sizes and memory are estimates.** The download sizes (about 300 MB, 900 MB, 1 GB and 1.8 GB) are estimates from third-party reports. The memory figures for the 1B and 3B models (879 MB and 2264 MB) are WebLLM's own published values. Check the model card on Hugging Face before a large download.
- **Cancelling does not stop the network request.** WebLLM does not expose a way to abort the files it is fetching. Cancel stops Velora waiting, and frees the model once the current load finishes. The browser may finish downloading the current file in the background. Files already saved are reused the next time. Close Safari's tab to stop all network use.
- **Only one download runs at a time**, and nothing downloads without a tap and a confirmation. Chat does not download files that Safari has cleared. If the library can report its cache (`hasModelInCache`), Velora asks you to download again. If it cannot, Velora cannot prevent the library from fetching the files itself, so check the AI models page after clearing storage.
- **Interrupted loads are detected.** Velora records when a model load starts and clears the record when it finishes. If Safari reloads the page during a load, the AI models page shows a notice and suggests a smaller model.
- **Switching models frees GPU memory** for the previous model. It does not delete its files.
- **No artificial waiting.** The 3 and 5 second pauses from version 1.2 are removed, because they are not a real delay. A reply starts when the model is ready. The only wait now is the model's own loading time.
- **Rolling chat summary.** After a reply, Velora may ask the model to update a short summary of messages that have left the prompt window. It is updated in small batches and read back in later prompts. It is written by the same small model, so it can be wrong or incomplete. The summary is shown to you nowhere, so check replies if something important seems to be forgotten.
- **Memory matching is still word-based.** Version 1.3 adds a very simple stemmer, so "trips" matches "trip". It still does not understand meaning, so pin important memories.
- **Generation quality is not measured.** No model was scored for roleplay quality, consistency or repetition. The character tests in the repository check Velora's own prompts, not the model's replies.

### What was tested for version 1.3

| Area | How it was checked |
|---|---|
| Model list: default kept, recommended model, large-model flag, sizes, licences, WebLLM id format | `npm test` (automatic) |
| No artificial reply timer, and the timing module removed | `npm test` (automatic) |
| Word stemming in memory matching | `npm test` (automatic) |
| Rolling summary: when it is due, chunking, no repeats, prompt contents | `npm test` (automatic) |
| Chat summary is included in the prompt only when it exists | `npm test` (automatic) |
| Imports, exports, icon names and syntax of every file | `tests/check-static.mjs` (automatic) |
| Models page, download, cancel, delete, switching, and the notice for interrupted loads | Written, but **not run**. `tests/browser-smoke.mjs` needs Chromium, which was not available in the development environment. |
| **Real model download, load and reply on a phone** | **Not tested.** |
| **Llama 3.2 1B on iPhone 14** | **Not tested.** |
| **Llama 3.2 3B on iPhone 14** | **Not tested. Expected to fail.** |
| **Offline use after downloading, on iPhone 14** | **Not tested.** |
| **Real model remembering earlier messages through a rolling summary** | **Not tested.** |

## Version 1.2: memory, conversation and model choice

**Read this first.** Velora's rules and prompts can help a model stay on track. They cannot make a small model understand more than it can. The default model (Qwen2.5 0.5B) is small. It will still drift, repeat itself, or forget details from earlier in a long chat. The 1.5B model is optional and may follow conversations more closely, but it has not been run on a real device by this project. In version 1.3 the Llama 3.2 1B model is the recommended alternative for an iPhone 14, and it is also untested.

- **Conversation understanding depends on the model.** Velora now sends the most recent 20 messages (where they fit the context window), the newest message always included, and rules telling the model to answer the latest message, stay consistent with the chat, and not invent events. These help, but they are instructions, not guarantees.
- **Memory selection is word matching, not meaning.** A memory is chosen when its words overlap with the last few messages. If you describe something in different words from the saved memory, it may not be chosen. Pin a memory to make sure it is always sent.
- **Memory notes are written by the same model.** They may be incomplete or wrong. Duplicates are skipped, but a wrong note is still saved until you edit or delete it.
- **Pinned and matching memories are only as good as their text.** Keep them short and specific. Long memories are cut to 200 characters in the prompt, and only about 700 characters of memories are sent in total.
- **Reply timing (removed in 1.3).** The 3 and 5 second pauses from version 1.2 were removed in version 1.3, because they were not a real delay.
- **Generation settings are not tested on a real model.** The temperature and top-p values were chosen to favour coherence. They may need adjusting after real use.
- **No hidden reasoning.** Velora does not perform any extra reasoning step before a reply. It prepares the prompt and then streams the model's answer.
- **The 1.5B model is not yet proven.** Its WebLLM model ids were not checked against the live WebLLM list in this development environment. The app checks the ids before a download and explains a problem if one is missing. It may not load on older iPhones or on Windows computers with small graphics cards. It is marked as untested on the Profile page.
- **Choosing a model never downloads it.** Only the model you choose is downloaded, and only when you tap Download. Switching models does not delete the other model's files.

### What was tested for version 1.2

| Area | How it was checked |
|---|---|
| Memory selection (relevance, pinning, order, limits, empty and long memories) | `npm test` (automatic) |
| Duplicate detection for memories and memory notes | `npm test` (automatic) |
| Prompt contains only selected memories, continuity rules, and the rule against invented history | `npm test` and `tests/browser-smoke.mjs` |
| Quoted speech and asterisk actions in the style guide | `npm test` and `tests/browser-smoke.mjs` |
| Reply timing choices, defaults and the countdown (removed in 1.3) | Earlier tests, now replaced by a check that the timer is gone |
| Stopping a reply during preparation leaves no empty reply | `tests/browser-smoke.mjs` |
| Editing, pinning, deleting, and clearing memories; memories surviving a page reload | `tests/browser-smoke.mjs` (Chromium, with the stub AI library) |
| Choosing a model does not download it; the choice is shown | `tests/browser-smoke.mjs` |
| Existing characters, chats and memories still load (no database version change) | `tests/browser-smoke.mjs`, and the earlier v1.1 flows |
| Layout of the memories and profile screens (phone-sized) | Screenshots taken in Chromium; reviewed by eye |
| **Real model remembering earlier messages or understanding references** | **Not tested. Needs a real model on a real device.** |
| **Real model keeping a personality over a long chat** | **Not tested.** |
| **Memory surviving a full app close, not just a reload** | **Not tested on a phone.** |
| **1.5B model loading and running on a real device** | **Not tested.** |

The automatic tests check Velora's own logic. They cannot judge how well a real model writes. Please try a few real conversations on your own device and use **Regenerate**, pins and edits when a reply goes wrong.

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

## Online AI (version 1.7.0)

- **No real provider has been tested.** The proxy and page were tested against a mock provider and a local proxy. Quality, filters and quotas with a real model are unknown until you test with your own key.
- **The proxy is not a password.** `ALLOWED_ORIGINS` stops other websites from using it in a browser. A program that forges the Origin header can still send requests, and then uses your provider quota. Treat the proxy address as shared, and set limits in the provider's console.
- **Free tiers may use prompts to improve products**, and their limits change. Check the provider's terms before you send private chats.
- **Chats leave the device** in online mode, and the provider's own safety filter may block some romantic replies. Velora cannot change the provider's filters.
- **The iPhone was not tested** in Safari or iOS 26. Streaming uses standard browser features, but this is unverified on a device.
- **Retries** happen only before a reply starts. A reply that is cut off is kept and must be regenerated by hand, so no text is duplicated.
- **Memory notes** from long chats are also sent to the provider in online mode, and they use a second request each time.

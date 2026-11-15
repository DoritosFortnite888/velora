# Changelog

## 1.3.0

Upgrade of the 1.2 app. Nothing was rebuilt. Characters, chats, memories and settings are kept. The database version did not change, so no data is converted.

**Important:** no model in this version has been run on an iPhone 14 by this project. See docs/LIMITATIONS.md.

### Models
- New **AI models page** (Profile > Manage AI models). Shows each model's download size, memory estimate, intelligence, speed and licence. Download, cancel, delete and switch are on this page. (`js/ui/views/models.js`)
- Added **Llama 3.2 1B Instruct** (recommended for iPhone 14, untested) and **Llama 3.2 3B Instruct** (strongest, likely too large for an iPhone 14). The Llama models use the Meta Llama 3.2 Community License. (`js/core/config.js`)
- The default is still **Qwen2.5 0.5B**, so existing installs keep working. Qwen2.5 1.5B is kept but marked as untested.
- Downloads ask for confirmation first, and only one download runs at a time. Nothing downloads on its own. (`js/ai/model-store.js`)
- Cancel stops Velora waiting for a download. The library cannot abort its own file requests, so the current file may finish in the background. Files already saved are reused.
- Switching models frees the memory of the model that was loaded before. Files are kept.
- If the browser has cleared a model's files, chat asks you to download them again instead of downloading silently, where the library can report its cache.
- If a model load is interrupted (for example Safari reloads the page), the AI models page shows a notice and suggests a smaller model.

### Conversation and roleplay
- **Rolling chat summary.** Messages that leave the 20-message prompt window are summarised in small batches after each reply, and the summary is included in later prompts. The summary is stored with each chat. (`js/core/prompt.js`, `js/ai/chat.js`)
- **Artificial reply timer removed.** The 3 and 5 second pauses (and the 3 second default) are gone. Replies start as soon as the model is ready. The setting and `js/core/timing.js` were removed.

### Memory
- Words are matched with a very simple stemmer, so "trips" matches "trip". (`js/core/memory.js`)
- New memory kind: **About the character**, for facts about the character themselves.

### Housekeeping
- Version 1.3.0. The service worker cache is renamed (`velora-v4`).
- Tests: 92 logic tests (was 83). The browser smoke test was updated for the new screens but was not run here, because Chromium was not available.
- Documentation updated: README, docs/LIMITATIONS.md, docs/IPHONE_INSTALL.md.

### Not changed
- Existing characters, chats, memories and their formats, the age and romance rules, the backup format, offline behaviour, and the default model.

## 1.2.0

Upgrade of the 1.1 app. Nothing was rebuilt. Existing characters, chats, memories and settings are kept. No database change was needed, so no data is converted.

### Memory
- Memories are chosen for each reply by how well they match the last few messages, and pinned memories are always included. Before, the 12 most recent were sent regardless of topic. (`js/core/memory.js`, `js/core/prompt.js`)
- Memories can be edited (text and type), pinned, and deleted one at a time. All memories for one character can be deleted at once. (`js/ui/views/memories.js`, `js/data/db.js`)
- New memory types: preference, relationship, and ongoing situation. Older types are unchanged.
- Memories record where they came from (typed by you, or written from chat). Notes written from chat are not repeated if they match an existing memory, and the note writer is told what is already saved.
- The prompt tells the model to use only the memories and chat it has, and not to invent shared history.

### Conversation and roleplay
- Continuity rules: keep earlier messages consistent, answer the latest message, and ask rather than invent. (`js/core/persona.js`)
- Up to 20 recent messages are considered for each prompt (was 16). The newest message is always kept.
- Style guide: actions in asterisks, spoken words in double quotes outside the asterisks, actions only when they fit, and no talk about being an AI unless the user asks sincerely.

### Replies and models
- Inference settings are in one place (`INFERENCE` in `js/core/config.js`): temperature 0.8 (was 0.85), top-p 0.92 (was 0.95). The repetition penalties are unchanged.
- Reply preparation time is configurable on the Profile page: Off, 3 seconds (default), or 5 seconds. Stopping during preparation removes the empty reply. (`js/core/timing.js`, `js/ai/chat.js`)
- Model choice: Qwen2.5 1.5B is offered alongside the 0.5B default. Choosing a model only saves the choice. The 1.5B model is untested on a real device. (`js/core/config.js`, `js/ai/model-store.js`, `js/ui/views/profile.js`)

### Housekeeping
- Version 1.2.0. The service worker cache is renamed (`velora-v3`) so old files are cleared on the next visit.
- Tests: 83 logic tests (was 61) and 52 browser checks (was 34). Browser checks use a stub AI library, as before.
- Documentation updated: README, docs/LIMITATIONS.md (new section for 1.2).

### Not changed
- The default model, offline behaviour, the age and romance rules, the backup format, and the iPhone install steps.

## 1.1.0
- Roleplay formatting, personality traits, romance level, reply length settings, and adult-only romance rules.

## 1.0.0
- First release: characters, chats, memories, offline support, and on-device model.

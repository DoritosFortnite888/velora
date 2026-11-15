# Changelog

## 1.3.2

Immersive roleplay upgrade. Nothing was rebuilt. Characters, chats, memories, settings, models and the database are unchanged.

**Important:** these are changes to the instructions sent to the model. Nothing here has been run on a real model. See docs/LIMITATIONS.md.

### Actions in every reply
- Almost every reply now includes at least one action in *asterisks*, tied to what was just said or done. Each reply gets a direction line that asks for it. (`NATURAL_STYLE` in `js/core/persona.js`, `turnSection` in `js/core/reactions.js`)
- The rules that let the model drop the action ("needs no action", "use an action only when it fits") are removed.
- Replies vary the shape instead: if the last few replies opened with an action, the next one opens with speech, and the action follows. The action itself is kept.
- Narration styles still differ. Minimal means short actions, not no actions. (`ROLE_STYLES` in `js/core/config.js`)

### Physical interactions
- Three new situations are recognised, each with its own reaction direction: **conflict** (punches, kicks, shoves, fights, hits, including on objects), **contact** (hugs, holding or grabbing a hand, touching, leaning in, pulling away) and **movement** (running, walking off, leaving, sitting down). These are checked before the emotional situations, so "I punch the wall" reads as force, not as anger. (`js/core/reactions.js`)
- Touch follows the romance rule. For a character who is not a confirmed adult, or whose romance level is Off, the reply is friendly and non-romantic. For a confirmed adult with romance on, touch stays within the romance level.
- Fights are kept in the scene: the character reacts to the impact and the fallout, and the reply is told not to be graphic.
- A punch or kick with a real-world marker (for example "for real" or "I know where you live") is treated as a real concern, the same as a threat.

### Staying in the scene
- The scene rules say the character replies as itself, never as a support agent, with no disclaimers or offers of help inside the scene. (`sceneRules` in `js/core/persona.js`)
- The continuity rules ask the model to keep the physical scene consistent: where each character is, who is sitting or moving, what each holds, and what just happened. This uses the chat already stored. Nothing new is saved. (`CONTINUITY_RULES` in `js/core/persona.js`)

### Safety
- Every protection from 1.3.1 is kept, in the same order: the safety rules are still the last thing the model reads. Friendly mode still never writes sexual content, and romance still needs a confirmed adult.

### Housekeeping
- Version 1.3.2. The service worker cache is renamed (`velora-v6`).
- Prompt size: a typical character's system prompt is about 580 characters longer than in 1.3.1. The new wording is kept short so the prompt still fits the 2048-token test window with room for the newest message.
- Tests: 124 logic tests (was 113).

## 1.3.1

Natural roleplay fixes. Nothing was rebuilt. Characters, chats, memories, settings and the database are unchanged.

**Important:** these are changes to the instructions sent to the model. Nothing here has been run on a real model. See docs/LIMITATIONS.md.

### Staying inside the scene
- The system prompt now opens with the character's identity: the character speaks and acts as themselves, in the first person, and is not an assistant. A custom system prompt is still kept after it. (`js/core/persona.js`, `js/core/prompt.js`)
- A new scene section says that threats, insults, arguments and dramatic lines are part of the fiction. It tells the model not to stop the scene to talk about rules, boundaries or safety. It keeps the exception for a sincere real-world concern. (`sceneRules` in `js/core/persona.js`)
- The style guide is written as positive guidance, with a format example the model is told not to copy. It replaces the long list of "Never" rules. (`NATURAL_STYLE` in `js/core/persona.js`)

### Reacting to the scene
- A new per-reply section reads the user's latest message and sets the situation: a dramatic threat in the story, an insult, anger, fear, sadness, affection, surprise, a joke, confusion, a question, or a real concern. (`js/core/reactions.js`)
- A sincere real-world threat (violent words with a real-world marker) or a message about ending one's life is flagged as a real concern, so the model steps out of the story and responds with care.
- Each personality trait has its own reaction style. Shy, sarcastic, dominant, gentle and the other traits now react differently. Characters with no traits are told to react from their personality notes and background. (`js/core/config.js`, `js/core/reactions.js`)
- Reaction direction depends on the user's message length: a few words get a short reply, a long message gets a fuller one.

### Avoiding repetition
- The last four replies are checked for repeated actions and action verbs. The model is told not to reuse them.
- If the last three replies all began with an action, the model is told to begin with speech. If every recent reply used an action, the model is told to skip the action this time.
- If the last three replies started with the same word, that word is listed as not to be used.

### Formatting
- Dialogue inside asterisks is moved outside them. Short action phrases in brackets, such as (looks away) or [smiles], are italicised. Ordinary parentheses are left alone. This runs on every reply. (`normaliseRoleplayText` in `js/core/format.js`)

### Safety rules
- The adult and friendly rules are reworded as short limits. Every protection is kept: no sexual content, no one under 18, no pressure or control of the user, honesty about being an AI when sincerely asked, and romance only for confirmed adults. Friendly mode no longer softens anger, sadness or conflict inside the story. (`js/core/safety.js`)

### Housekeeping
- Version 1.3.1. The service worker cache is renamed (`velora-v5`).
- Tests: 113 logic tests (was 92).

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

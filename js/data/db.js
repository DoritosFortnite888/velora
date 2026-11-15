// Local storage in IndexedDB. Everything stays in this browser on this device.
// Stores: characters, conversations, messages, memories, settings.

const DB_NAME = 'velora';
const DB_VERSION = 1;

let dbPromise = null;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in globalThis)) {
        reject(new Error('This browser does not provide IndexedDB storage, so Velora cannot save characters or chats.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('characters')) {
          db.createObjectStore('characters', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('conversations')) {
          const store = db.createObjectStore('conversations', { keyPath: 'id' });
          store.createIndex('characterId', 'characterId');
        }
        if (!db.objectStoreNames.contains('messages')) {
          const store = db.createObjectStore('messages', { keyPath: 'id' });
          store.createIndex('conversationId', 'conversationId');
        }
        if (!db.objectStoreNames.contains('memories')) {
          const store = db.createObjectStore('memories', { keyPath: 'id' });
          store.createIndex('characterId', 'characterId');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Storage could not be opened.'));
      request.onblocked = () => reject(new Error('Velora is open in another tab. Close the other tab and reload this one.'));
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

// Runs work inside one transaction. The work function returns a request, whose result is
// returned once the transaction has completed.
async function run(storeNames, mode, work) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let request;
    try {
      request = work(tx);
    } catch (err) {
      try { tx.abort(); } catch { /* already finished */ }
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(request ? request.result : undefined);
    tx.onerror = () => reject(tx.error || new Error('Storage error.'));
    tx.onabort = () => reject(tx.error || new Error('Storage was full or unavailable, so the change was not saved. Free up space and try again.'));
  });
}

const read = (name, action) => run([name], 'readonly', (tx) => action(tx.objectStore(name)));
const write = (name, action) => run([name], 'readwrite', (tx) => action(tx.objectStore(name)));
const byTime = (key) => (a, b) => (a[key] ?? 0) - (b[key] ?? 0);

// ---------- Characters ----------

export async function listCharacters() {
  return (await read('characters', (s) => s.getAll())) ?? [];
}
export function getCharacter(id) {
  return read('characters', (s) => s.get(id));
}
export function saveCharacter(character) {
  return write('characters', (s) => s.put(character));
}

// Deletes a character with all of its chats, messages and memories.
export async function deleteCharacter(id) {
  const conversations = await listConversations(id);
  for (const conversation of conversations) {
    await deleteConversation(conversation.id);
  }
  const memories = await listMemories(id);
  await run(['memories', 'characters'], 'readwrite', (tx) => {
    for (const memory of memories) tx.objectStore('memories').delete(memory.id);
    tx.objectStore('characters').delete(id);
  });
}

// ---------- Conversations ----------

export async function listConversations(characterId) {
  const rows = characterId
    ? await read('conversations', (s) => s.index('characterId').getAll(characterId))
    : await read('conversations', (s) => s.getAll());
  return (rows ?? []).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}
export function getConversation(id) {
  return read('conversations', (s) => s.get(id));
}
export function saveConversation(conversation) {
  return write('conversations', (s) => s.put(conversation));
}
export async function deleteConversation(id) {
  const messages = await listMessages(id);
  await run(['messages', 'conversations'], 'readwrite', (tx) => {
    for (const message of messages) tx.objectStore('messages').delete(message.id);
    tx.objectStore('conversations').delete(id);
  });
}

// ---------- Messages ----------

export async function listMessages(conversationId) {
  const rows = await read('messages', (s) => s.index('conversationId').getAll(conversationId));
  return (rows ?? []).sort(byTime('createdAt'));
}
export function saveMessage(message) {
  return write('messages', (s) => s.put(message));
}
export function deleteMessage(id) {
  return write('messages', (s) => s.delete(id));
}

// ---------- Memories ----------

export async function listMemories(characterId) {
  const rows = await read('memories', (s) => s.index('characterId').getAll(characterId));
  return (rows ?? []).sort(byTime('createdAt'));
}
export function saveMemory(memory) {
  return write('memories', (s) => s.put(memory));
}
export function deleteMemory(id) {
  return write('memories', (s) => s.delete(id));
}
// Removes every memory for one character. Chats and the character itself are kept.
export async function deleteMemoriesFor(characterId) {
  const memories = await listMemories(characterId);
  if (memories.length === 0) return 0;
  await run(['memories'], 'readwrite', (tx) => {
    for (const memory of memories) tx.objectStore('memories').delete(memory.id);
  });
  return memories.length;
}

// ---------- Settings ----------

export async function getSetting(key) {
  const row = await read('settings', (s) => s.get(key));
  return row ? row.value : undefined;
}
export function setSetting(key, value) {
  return write('settings', (s) => s.put({ key, value }));
}

// ---------- Backup and erase ----------

export async function exportBackup() {
  return {
    format: 'velora-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    characters: (await read('characters', (s) => s.getAll())) ?? [],
    conversations: (await read('conversations', (s) => s.getAll())) ?? [],
    messages: (await read('messages', (s) => s.getAll())) ?? [],
    memories: (await read('memories', (s) => s.getAll())) ?? [],
  };
}

// Adds or replaces records from a backup file. Existing records with the same id are overwritten.
export async function importBackup(data) {
  if (!data || data.format !== 'velora-backup' || !Array.isArray(data.characters)) {
    throw new Error('This file is not a Velora backup.');
  }
  const groups = {
    characters: data.characters,
    conversations: data.conversations ?? [],
    messages: data.messages ?? [],
    memories: data.memories ?? [],
  };
  for (const [store, rows] of Object.entries(groups)) {
    if (!rows.length) continue;
    await run([store], 'readwrite', (tx) => {
      const objectStore = tx.objectStore(store);
      for (const row of rows) objectStore.put(row);
    });
  }
  return {
    characters: groups.characters.length,
    conversations: groups.conversations.length,
    messages: groups.messages.length,
    memories: groups.memories.length,
  };
}

export async function eraseEverything() {
  await run(['characters', 'conversations', 'messages', 'memories', 'settings'], 'readwrite', (tx) => {
    for (const name of ['characters', 'conversations', 'messages', 'memories', 'settings']) {
      tx.objectStore(name).clear();
    }
  });
}

// Seeds the three starter characters the first time the app runs.
export async function seedStartersIfEmpty(starters) {
  const existing = await listCharacters();
  if (existing.length > 0) return false;
  await run(['characters'], 'readwrite', (tx) => {
    for (const character of starters) tx.objectStore('characters').put(character);
  });
  return true;
}

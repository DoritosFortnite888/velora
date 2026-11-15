// Chooses where a reply is written: on this device (offline, the default) or by the online proxy.
// Online is used only when ALL of these are true, so a half-finished setup never sends chats anywhere:
//   1. the person chose Online AI,
//   2. a proxy address is saved,
//   3. the person agreed that chats are sent to the AI provider,
//   4. a test to that proxy succeeded (the test is what makes the claim that it works).
// Changing the proxy address clears step 4, so a new address must be tested again.
import * as db from '../data/db.js';
import { generate as generateOnDevice } from './engine.js';
import { streamOnlineReply, normalizeProxyUrl, OnlineError } from './online.js';

export async function getOnlineState() {
  return {
    chosen: (await db.getSetting('aiMode')) === 'online',
    proxyUrl: (await db.getSetting('onlineProxyUrl')) || '',
    consentAt: (await db.getSetting('onlineConsentAt')) || null,
    verified: (await db.getSetting('onlineVerified')) || null, // { at, provider, model }
  };
}

// The rule in one place, so it can be tested without storage. Anything not fully set up is offline.
export function resolveAIMode(state) {
  return state.chosen && state.proxyUrl && state.consentAt && state.verified ? 'online' : 'offline';
}

// 'online' or 'offline'.
export async function getAIMode() {
  return resolveAIMode(await getOnlineState());
}

// Saves a proxy address after checking its form. A new address must be tested before it can be used.
export async function saveProxyUrl(raw) {
  const url = normalizeProxyUrl(raw);
  const current = await getOnlineState();
  if (url !== current.proxyUrl) await db.setSetting('onlineVerified', null);
  await db.setSetting('onlineProxyUrl', url);
  return url;
}

// Records the person's agreement to send chats to the AI provider through the proxy. Turning it off
// also switches back to offline mode.
export async function setOnlineConsent(agreed) {
  if (agreed) {
    await db.setSetting('onlineConsentAt', Date.now());
  } else {
    await db.setSetting('onlineConsentAt', null);
    await db.setSetting('aiMode', 'offline');
  }
}

// Called after a successful test. Stores what the proxy reported, never any key.
export async function recordVerification({ provider, model }) {
  await db.setSetting('onlineVerified', { at: Date.now(), provider: provider ?? null, model: model ?? null });
}

// Switches to online mode. Refuses unless every step above is done.
export async function chooseOnline() {
  const state = await getOnlineState();
  if (!state.proxyUrl || !state.consentAt || !state.verified) {
    throw new OnlineError('not_ready', 'Online AI is not ready yet. Save the proxy address, agree that chats are sent to the AI provider, and run Test connection first.');
  }
  await db.setSetting('aiMode', 'online');
}

export async function chooseOffline() {
  await db.setSetting('aiMode', 'offline');
}

// Writes or streams one reply. Used for replies and for the background memory notes, so both follow the
// same mode. In online mode the on-device model is not loaded at all.
export async function generateText(messages, options, mode, hooks = {}) {
  if (mode === 'online') {
    const state = await getOnlineState();
    if (!state.proxyUrl) throw new OnlineError('not_ready', 'The proxy address is missing. Open Online AI setup.');
    return streamOnlineReply(state.proxyUrl, messages, options, hooks);
  }
  return generateOnDevice(messages, options);
}

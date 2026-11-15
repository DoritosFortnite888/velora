import * as db from '../../data/db.js';
import { chatBlockReason, sendMessage, regenerateLast, stopGeneration, isGenerating } from '../../ai/chat.js';
import { isDownloaded, selectedSpec } from '../../ai/model-store.js';
import { contentMode, ADULT_MIN_AGE } from '../../core/persona.js';
import { AGE_GATE } from '../../core/safety.js';
import { esc, avatarHTML, formatText, TYPING_HTML, ICON, notFoundPage, toast, confirmAction } from '../dom.js';

const isTouchDevice = () => !window.matchMedia?.('(pointer: fine)').matches;

function messageHTML(m) {
  const body = m.text ? formatText(m.text) : TYPING_HTML;
  return `<div class="msg ${m.isFromUser ? 'msg--user' : 'msg--ai'}" data-id="${m.id}"><div class="bubble">${body}</div></div>`;
}

export async function renderChat(conversationId) {
  const conversation = await db.getConversation(conversationId);
  if (!conversation) return notFoundPage('This chat no longer exists.');
  const character = await db.getCharacter(conversation.characterId);
  if (!character) return notFoundPage('The character for this chat was deleted.');

  const messages = await db.listMessages(conversationId);
  const block = chatBlockReason(character);
  const downloaded = await isDownloaded(await selectedSpec());

  const html = `
    <div class="chat" data-conversation="${conversation.id}">
      <header class="chat-header">
        <a class="icon-btn" href="#/chats" aria-label="Back to chats">${ICON.back}</a>
        <a class="chat-title" href="#/character/${character.id}">
          ${avatarHTML(character, 'avatar--sm')}
          <span><strong>${esc(character.name)}</strong><small>${esc(character.tagline || 'Tap for profile')}</small></span>
        </a>
        <div class="page-header__actions">
          <a class="icon-btn" href="#/memories/${character.id}" aria-label="Memories" title="Memories">${ICON.memory}</a>
          <button class="icon-btn" id="regen-btn" type="button" aria-label="Regenerate last reply" title="Regenerate">${ICON.refresh}</button>
          <button class="icon-btn" id="delete-chat" type="button" aria-label="Delete this chat" title="Delete chat">${ICON.trash}</button>
        </div>
      </header>

      ${!downloaded ? '<a class="banner" href="#/profile">The AI model is not downloaded yet. Tap here to download it once.</a>' : ''}
      ${block ? `<a class="banner banner--warn" href="#/character/${character.id}">${esc(block)}</a>` : ''}
      ${!block && character.ageGate === AGE_GATE.ADULT && contentMode(character).reason === 'age-unclear'
        ? `<a class="banner" href="#/edit/${character.id}">Romance is off. Add this character's age (${ADULT_MIN_AGE}+) in Edit to allow it.</a>` : ''}

      <div class="messages" id="messages">${messages.map(messageHTML).join('')}</div>
      <p class="status" id="status" hidden></p>

      <form class="composer" id="composer">
        <textarea id="draft" rows="1" maxlength="2000" placeholder="Message ${esc(character.name)}" aria-label="Message ${esc(character.name)}" ${block ? 'disabled' : ''}></textarea>
        <button type="submit" class="send-btn" id="send" aria-label="Send" ${block ? 'disabled' : ''}>${ICON.send}</button>
      </form>
    </div>`;

  return {
    html,
    bind(root) {
      const messagesEl = root.querySelector('#messages');
      const draft = root.querySelector('#draft');
      const send = root.querySelector('#send');
      const regen = root.querySelector('#regen-btn');
      const form = root.querySelector('#composer');

      // Live updates look elements up at call time, so a reply keeps streaming even if the
      // user navigates away and back. Updates for another chat are ignored.
      const here = () => document.querySelector(`.chat[data-conversation="${conversation.id}"]`);
      const bubbleFor = (id) => here()?.querySelector(`.msg[data-id="${id}"] .bubble`);
      const scrollDown = () => {
        const list = here()?.querySelector('#messages');
        if (list) list.scrollTop = list.scrollHeight;
      };

      const setBusy = (busy) => {
        send.innerHTML = busy ? ICON.stop : ICON.send;
        send.setAttribute('aria-label', busy ? 'Stop reply' : 'Send');
        send.dataset.mode = busy ? 'stop' : 'send';
        if (regen) regen.disabled = busy;
      };

      const setStatus = (text) => {
        const el = here()?.querySelector('#status');
        if (!el) return;
        el.textContent = text;
        el.hidden = !text;
      };

      const listeners = {
        onMessage(m) {
          const list = here()?.querySelector('#messages');
          if (!list || list.querySelector(`[data-id="${m.id}"]`)) return;
          list.insertAdjacentHTML('beforeend', messageHTML(m));
          scrollDown();
        },
        onToken(id, text) {
          const bubble = bubbleFor(id);
          if (bubble) bubble.innerHTML = formatText(text) || TYPING_HTML;
          scrollDown();
        },
        onFinal(id, text) {
          const bubble = bubbleFor(id);
          if (bubble) bubble.innerHTML = formatText(text);
        },
        onRemove(id) {
          here()?.querySelector(`.msg[data-id="${id}"]`)?.remove();
        },
        onStatus(text) {
          setStatus(text);
        },
        onError(message) {
          toast(message, 7000);
        },
        onDone() {
          setBusy(false);
          setStatus('');
        },
      };

      if (isGenerating(conversation.id)) setBusy(true);

      const autosize = () => {
        draft.style.height = 'auto';
        draft.style.height = `${Math.min(draft.scrollHeight, 150)}px`;
      };
      draft.addEventListener('input', autosize);

      // On a computer, Enter sends and Shift+Enter starts a new line. On a phone, Enter is a new line.
      draft.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isTouchDevice()) {
          e.preventDefault();
          form.requestSubmit();
        }
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isGenerating(conversation.id)) {
          stopGeneration();
          return;
        }
        const text = draft.value.trim();
        if (!text) return;
        draft.value = '';
        autosize();
        setBusy(true);
        try {
          await sendMessage({ conversation, character, text, listeners });
        } catch (err) {
          // Problems found before the reply started: give the text back and explain why.
          if (!draft.value) draft.value = text;
          autosize();
          setBusy(false);
          toast(err.message, 7000);
        }
      });

      regen?.addEventListener('click', async () => {
        if (isGenerating(conversation.id)) return;
        setBusy(true);
        try {
          await regenerateLast({ conversation, character, listeners });
        } catch (err) {
          setBusy(false);
          toast(err.message, 6000);
        }
      });

      root.querySelector('#delete-chat')?.addEventListener('click', async () => {
        if (!confirmAction('Delete this chat? Its messages will be removed. Memories saved for the character are kept.')) return;
        if (isGenerating(conversation.id)) stopGeneration();
        await db.deleteConversation(conversation.id);
        toast('Chat deleted.');
        location.hash = '#/chats';
      });

      scrollDown();
    },
  };
}

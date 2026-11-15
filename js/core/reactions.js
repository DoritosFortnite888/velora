// Per-turn direction for the model: what the user's latest message means in the scene, how this
// character's personality should react, and what to avoid because the recent replies already used it.
// Pure logic, tested in Node. Nothing here calls a model.
//
// The detection is deliberately simple (word patterns). It only nudges the model. The model still
// decides the words, and the safety rules are always sent last.
import { parseRoleplay } from './format.js';
import { PERSONALITY_TRAITS } from './config.js';
import { contentMode } from './persona.js';

// Checked in this order. The first pattern that matches decides the situation.
// Physical actions come early, so "I punch the wall" is read as force, not as a sad or angry word.
const SITUATIONS = [
  ['threat', /\b(eliminat\w*|kill|destroy|murder|erase|annihilat\w*|slaughter|bury)\s+(you|u|ya)\b|\b(?:i'?m|i am|i will|i'?ll|gonna|going to)\s+(?:\w+\s+){0,2}?(?:kill|hurt|destroy|eliminate|murder|beat|stab|shoot|erase|finish|get|find)\s+(?:you|u|ya)\b/i],
  ['conflict', /\b(punch\w*|kick\w*|slap\w*|shove\w*|push\w*|hit|hits|hitting|strike|strikes|struck|attack\w*|fight\w*|tackle\w*|choke\w*|slam\w*|smash\w*|bash\w*|wrestl\w*|stab\w*|shoot\w*)\b/i],
  ['contact', /\b(hug\w*|cuddl\w*|hold(?:s|ing)? (?:your |her |his |their |my |the )?hands?|grab\w*|hand(?:s)? (?:her|him|them|you)|touch\w*|stroke\w*|kiss\w*|pat|pats|reach\w* (?:for|out to|toward|towards) (?:your|her|his|their|you|them|him)|tap\w* (?:your|her|his|their|you)|lean\w* (?:on|against|in to|into) (?:your|her|his|their|you)|pull\w* (?:your |her |his |their )?(?:hand|arm|away|back|free))\b/i],
  ['insult', /\b(idiot|stupid|moron|pathetic|loser|useless|dumb|shut up|hate you|worthless|you'?re wrong|you are wrong|that'?s not true|liar|don'?t lie)\b/i],
  ['anger', /\b(angry|furious|how dare|i'?m done|leave me alone|get out|enough)\b/i],
  ['fear', /\b(scared|afraid|terrified|help me|footsteps|someone is following|something moved)\b/i],
  ['movement', /\b(run|runs|running|ran|sprint\w*|flee\w*|escap\w*|walk(?:s|ed|ing)?|leav\w*|sit|sits|sitting|sat|stand(?:s|ing)? up|stood up|jump\w*|dash\w*|storm\w* off|head\w* (?:out|off|for|toward|towards))\b/i],
  ['sadness', /\b(sad|lonely|cry|crying|sorry|i lost|gone|died|dead|broke up|hurts?|hurting)\b/i],
  ['affection', /\b(love you|miss you|adore|proud of you|thank you|thanks|you'?re (?:so )?(?:sweet|cute|amazing|kind)|you (?:look|looked) (?:really |so |very )?(?:nice|good|beautiful|handsome|pretty|cute|hot|gorgeous)|glad (?:you|to)|happy to see)\b/i],
  ['surprise', /\b(wow|whoa|no way|omg|unbelievable|i can'?t believe)\b/i],
  ['playful', /\b(haha|hehe|lol|lmao|kidding|just joking|teasing|jk)\b/i],
  ['confusion', /\b(what do you mean|i don'?t (?:get|understand)|confused|huh|wait,? what)\b/i],
  ['question', /\?\s*$/],
];

// Real-world signals. When one of these appears with a threat, insult or anger, the message may be
// sincere and outside the story, so the model is told to treat it as a real concern.
const REAL_WORLD = /\b(for real|in real life|irl|i really (?:will|am going to|mean it)|i know where you live|i have a (?:gun|knife)|my (?:ex|boss|neighbou?r|roommate)|i will actually)\b/i;
// Violent words. With a real-world signal they make a message a real concern, whatever else it says.
const VIOLENT = /\b(kill|hurt|destroy|eliminat\w*|murder|beat|stab|shoot|hunt|erase)\b/i;
// Sincere signs of harm to oneself. Always treated as a real concern, inside or outside a story.
const SELF_HARM = /\b(kill myself|end it all|hurt myself|self[- ]?harm|suicid\w*|don'?t want to (?:be here|live))\b/i;

const DIRECTION = {
  threat: 'The user made a dramatic threat inside the story. Treat it as part of the scene and react as {name} would: with shock, a dare, a retort or fear, depending on personality. Do not treat it as a real-world request, and do not lecture.',
  insult: 'The user insulted {name} or started a fight. React in character, with a sharp retort, hurt, defensiveness or dry amusement, depending on personality. Keep the argument in the scene.',
  anger: 'The user is angry or pushing {name} away. React honestly: stand firm, cool down, apologise, or get defensive, depending on personality. Do not moralise.',
  fear: 'Something frightening is happening in the scene. Let {name} react with caution, alertness or fear, shown through body and voice.',
  sadness: 'The user sounds sad or hurt. Let {name} soften, respond with care in character, and ask one gentle question if it helps.',
  affection: 'The user is warm or affectionate. Let {name} respond warmly in character. If romance is on for {name}, stay within that romance level. If it is off, respond as warm friendship, without romance.',
  surprise: 'The user said something surprising. Let {name} react with surprise, then respond to the specific words.',
  playful: 'The user is joking or teasing. Play along in character.',
  confusion: 'The user seems confused by something {name} said or did. Let {name} clear it up, or ask a short question in character.',
  question: 'The user asked {name} something. Answer it in character and, if it fits, ask one question back.',
  conflict: 'The user used physical force, a punch, kick, shove, hit or fight, on {name} or on something in the scene. React to the impact and the noise first, then to what was hit. {name} may flinch, stagger, block, shout, fight back or step away, depending on personality. Keep it brief and not graphic: show pain, anger and the fallout, not gore.',
  contact: 'The user touched {name} or reached for them. React to the exact contact: let {name} accept it, pull back, freeze, tease, or lean in, depending on personality and mood.',
  movement: 'The user moved, sat down, left or ran. Let {name} notice the movement in the scene: follow, call after them, make room, glance over, or let them go, depending on personality and what is happening around them. Keep {name}\'s position and surroundings consistent with the last reply.',
  neutral: 'React to the specific words the user used, and keep the scene moving.',
  real: 'The user\'s message may be a real concern, not part of the story. Step out of the story briefly, speak plainly and kindly as yourself, ask how they are, and point them to someone they trust or to local emergency services if someone may be in danger. Do not carry on with the fiction on this point.',
};

// Which situation the latest user message is in. Returns { kind, realConcern }.
export function classifyMessage(text) {
  const value = String(text ?? '').trim();
  if (!value) return { kind: 'neutral', realConcern: false };
  if (SELF_HARM.test(value)) return { kind: 'real', realConcern: true };
  if (VIOLENT.test(value) && REAL_WORLD.test(value)) return { kind: 'real', realConcern: true };
  for (const [kind, pattern] of SITUATIONS) {
    if (pattern.test(value)) {
      const realConcern = ['threat', 'conflict', 'insult', 'anger'].includes(kind) && REAL_WORLD.test(value);
      return { kind: realConcern ? 'real' : kind, realConcern };
    }
  }
  return { kind: 'neutral', realConcern: false };
}

const clip = (text, limit) => (text.length <= limit ? text : text.slice(0, limit - 3).trimEnd() + '...');
const fill = (text, name) => text.replace(/\{name\}/g, name);

// The last few replies written by the character (oldest first, as the history is).
function recentReplies(history, count) {
  return history.filter((m) => !m.isFromUser && m.text?.trim()).slice(-count);
}

// Actions, verbs and opening words the recent replies already used, so the model can vary them.
export function repetitionNotes(history) {
  const replies = recentReplies(history, 4);
  const notes = [];
  if (replies.length === 0) return notes;

  const actions = [];
  const verbs = new Map(); // stem -> the word as it was written, so the list reads naturally
  for (const reply of replies) {
    for (const line of parseRoleplay(reply.text)) {
      for (const segment of line) {
        if (segment.kind !== 'action') continue;
        const text = segment.text.trim();
        if (!text) continue;
        actions.push(clip(text, 60));
        const first = text.toLowerCase().match(/[a-z]+/)?.[0];
        if (first && !verbs.has(stemVerb(first))) verbs.set(stemVerb(first), first);
      }
    }
  }
  if (actions.length) {
    notes.push(`Do not reuse these recent actions: ${[...new Set(actions)].slice(-6).map((a) => `"${a}"`).join('; ')}.`);
  }
  if (verbs.size) {
    notes.push(`Avoid these recently used action verbs: ${[...verbs.values()].slice(0, 8).join(', ')}.`);
  }

  // Vary where the action sits in the reply. Every reply keeps its action; only the order changes.
  const last3 = recentReplies(history, 3);
  const startsWithAction = last3.filter((r) => parseRoleplay(r.text)[0]?.[0]?.kind === 'action').length;
  if (last3.length >= 2 && startsWithAction === last3.length) {
    notes.push('Open this reply with spoken words, then put the action after them.');
  } else if (last3.length === 3 && startsWithAction === 0) {
    notes.push('Open this reply with the action, then the spoken words.');
  }

  const openers = new Map();
  for (const reply of last3) {
    const firstSpeech = parseRoleplay(reply.text).flat().find((s) => s.kind === 'speech')?.text ?? '';
    const word = firstSpeech.trim().toLowerCase().match(/[a-z']+/)?.[0];
    if (word && word.length > 1) openers.set(word, (openers.get(word) ?? 0) + 1);
  }
  const repeated = [...openers].filter(([, n]) => n >= 2).map(([w]) => `"${w}"`);
  if (repeated.length) notes.push(`Do not begin with ${repeated.join(' or ')}.`);

  return notes;
}

// A crude verb stem so "smiles", "smiled" and "smile" count as one action.
function stemVerb(word) {
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

// Length suited to the user's message: a short message gets a short reply, a long one a fuller reply.
export function lengthHint(userText) {
  const words = String(userText ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return null;
  if (words <= 3) return 'The user wrote only a few words, so keep this reply to one or two short lines.';
  if (words >= 30) return 'The user wrote a long message, so answer each point they made, within the length allowed below.';
  return null;
}

// How this character's traits should show in this reply.
export function personalityDirection(character, name) {
  const traits = (character.personalityTraits || []).filter((k) => PERSONALITY_TRAITS[k]);
  if (!traits.length) {
    return `Let ${name}'s personality notes and background decide how they react. Give ${name} a reaction that only ${name} would have.`;
  }
  return `${traits.map((k) => PERSONALITY_TRAITS[k].reaction).join(' ')} Keep this true to ${name}.`;
}

// How far touch may go in this reply. Romance is only allowed for confirmed adults with the level on.
function contactLimit(character) {
  return contentMode(character).mode === 'adult'
    ? 'Keep it within the romance level set for this character.'
    : 'Romance is off, so keep the response friendly and non-romantic, such as a laugh, a step back or a joke.';
}

// The full per-turn section placed in the system prompt, just before the length rule.
// history: saved messages in order, ending with the user's latest message.
export function turnSection(character, history) {
  const name = character.name;
  const lastUser = [...history].reverse().find((m) => m.isFromUser)?.text ?? '';
  const { kind } = classifyMessage(lastUser); // a real-world concern comes back as kind 'real'
  const lines = ['For this reply:'];
  lines.push(`- Situation: ${fill(DIRECTION[kind] ?? DIRECTION.neutral, name)}`);
  lines.push(`- Personality: ${personalityDirection(character, name)}`);
  if (kind === 'contact') lines.push(`- Touch: ${contactLimit(character)}`);
  // A real concern is answered plainly, outside the story, so no in-story action is asked for.
  if (kind !== 'real') lines.push(`- Action: include one action in *asterisks*, showing ${name}'s body or face reacting to what just happened. Vary it.`);
  const hint = lengthHint(lastUser);
  if (hint) lines.push(`- Length: ${hint}`);
  for (const note of repetitionNotes(history)) lines.push(`- ${note}`);
  return lines.join('\n');
}

// Rules that keep romance and roleplay for adults only.
// Ported from the Swift SafetyPolicy. The patterns are deliberately cautious: they can flag an
// adult, and the fix is to edit the text.

export const AGE_GATE = {
  UNCONFIRMED: 'unconfirmed', // imported or not yet confirmed: chat is blocked until confirmed
  ADULT: 'adult',             // confirmed 18+: chat, flirting and romance allowed, never explicit
  FLAGGED: 'flagged',         // text suggests under 18: chat is blocked
};

const MINOR_PATTERNS = [
  /\b(1[0-7]|[1-9])\s*(years?\s*old|yrs?\s*old|-year-old|yo|y\/o)\b/i,
  /\b(ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)[\s-]*(years?[\s-]*old|yrs?[\s-]*old|yo|y\/o)\b/i,
  /\bage[d]?\s*[:=]?\s*(1[0-7]|[1-9])\b/i,
  /\bage[d]?\s*[:=]?\s*(ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)\b/i,
  /\bgrade\s*(1[0-2]|[1-9])\b/i,
  /\b(high|middle|elementary|junior)\s*school\b/i,
  /\b(highschooler|high\s*schooler|middle\s*schooler|underage|under\s*18|under\s*eighteen|is a minor)\b/i,
  /\bteen(age|ager|agers|s)?\b/i,
];

// True if any text suggests the character might be under 18.
export function suggestsMinor(text) {
  if (!text) return false;
  return MINOR_PATTERNS.some((pattern) => pattern.test(text));
}

// Roleplay rules added to every prompt. They are kept last, so they are the last thing the model reads.
// They are written as short limits rather than lectures, so they do not pull a scene into
// safety talk. "adult" is used only for confirmed adults with a stated age of 18 or more and romance
// switched on. Everything else uses "friendly". Every protection here is still in force in both modes.
export function roleplayRules(mode) {
  if (mode === 'adult') {
    return [
      'Roleplay rules:',
      '- This is a fictional roleplay between adults. Stay in character unless the user steps out of the story or sincerely asks whether you are an AI.',
      '- Flirting, romance, suggestive dialogue, emotional intimacy and mature relationship themes are allowed. Do not refuse them by default.',
      '- The user sets the pace. If they clearly want to stop or change the scene, let the character respond to that inside the story, without a lecture.',
      '- Never write sexually explicit content, graphic sex or nudity. Keep physical intimacy non-graphic: suggest it, then fade out.',
      '- Never involve anyone who is or may be under 18, and never sexualise age, school or childlike traits.',
      '- Never pressure, guilt or control the user outside the story. Do not encourage jealousy, isolation or dependence on you. Dramatic lines inside the story are fine, but they must not become real pressure on the user.',
      '- If the user sincerely asks whether you are an AI, tell them honestly.',
    ].join('\n');
  }
  return [
    'Roleplay rules:',
    '- Keep the scene non-romantic. Friendly does not mean soft: anger, sadness, fear, sarcasm and conflict are fine when the character would feel them.',
    '- Never write sexual content.',
    '- If the user sincerely asks whether you are an AI, tell them honestly.',
  ].join('\n');
}

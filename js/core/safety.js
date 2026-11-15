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

// Instructions added to every prompt, depending on the character's age gate.
export function roleplayRules(gate) {
  if (gate === AGE_GATE.ADULT) {
    return [
      'Roleplay rules:',
      '- Stay in character. Reply in one to three short paragraphs with natural dialogue. Actions may be written in asterisks.',
      '- Flirting, dating scenes and romance are allowed between adults, but keep them tasteful. Never write sexually explicit content. Fade out of intimate moments.',
      "- Respect the user's boundaries. If they say stop or step out of the story, do so.",
      '- Never pressure, guilt or control the user. Do not encourage jealousy, isolation or dependence.',
      '- If the user sincerely asks whether you are an AI, tell them honestly.',
    ].join('\n');
  }
  return [
    'Roleplay rules:',
    '- Stay in character. Reply in one to three short paragraphs.',
    '- Keep the conversation friendly and non-romantic. Do not flirt or write romantic or intimate scenes.',
    '- If the user sincerely asks whether you are an AI, tell them honestly.',
  ].join('\n');
}

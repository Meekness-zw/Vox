import type { SimpleMessage } from "./agent-runtime";

const NEGATED_HANDOFF = [
  /\b(?:do not|don't|dont|no|not now|never)\s+(?:connect|transfer|hand)\b/i,
  /\b(?:do not|don't|dont)\s+(?:want|need)\s+(?:to\s+)?(?:(?:speak|talk|chat)\s+(?:to|with)\s+)?(?:a\s+)?(?:human|person|agent|representative|manager)\b/i,
  /\b(?:handisi kuda|musandi(?:batanidza|endesa)|kwete)\b/i,
];

const DIRECT_HANDOFF = [
  /\b(?:connect|transfer|hand)\s+(?:me\s+)?(?:over\s+)?to\s+(?:a\s+)?(?:human|real person|person|agent|representative|team member|manager)\b/i,
  /\b(?:i\s+)?(?:want|need|would like|prefer)\s+(?:to\s+)?(?:speak|talk|chat)\s+(?:to|with)\s+(?:a\s+)?(?:human|real person|person|agent|representative|team member|manager)\b/i,
  /\b(?:human|real person|representative|team member|manager)\s*,?\s*(?:please|now)?[.!?]*$/i,
  /\bndibatanidz(?:e|ei)\s+(?:na|ne)?\s*(?:munhu|maneja|mushandi)\b/i,
  /\bndinoda\s+kutaura\s+(?:na|ne)\s*(?:munhu|maneja|mushandi)\b/i,
  /\b(?:munhu chaiye|maneja|mushandi)\s*(?:ndapota)?[.!?]*$/i,
];

const HANDOFF_OFFER = [
  /\b(?:would|do)\s+you\s+(?:like|want)\s+(?:me\s+)?to\s+(?:connect|transfer)\s+you\b/i,
  /\b(?:can|shall|may)\s+i\s+(?:connect|transfer)\s+you\b/i,
  /\b(?:connect|transfer)\s+you\s+to\s+(?:a\s+)?(?:human|person|team member|manager|representative)\b/i,
  /\b(?:munoda|mungada)\s+(?:kuti\s+)?ndi(?:ku|)batanidz(?:e|ei)\s+(?:na|ne)?\s*(?:munhu|maneja|mushandi)\b/i,
  /\bndi(?:ku|)batanidz(?:e|ei)\s+(?:na|ne)?\s*(?:munhu|maneja|mushandi)\b/i,
];

const AFFIRMATIVE = [
  /^(?:yes|yes please|yeah|yep|sure|okay|ok|please|go ahead|that'?s fine)(?:\s*,?\s*(?:please(?:\s+(?:connect|transfer)\s+me)?|connect me|transfer me|do that))?[.!?]*$/i,
  /^(?:hongu|ehe|zvakanaka|ndapota)(?:\s+(?:ndapota|ndibatanidzei|ndibatanidze|itai izvozvo))?[.!?]*$/i,
  /^(?:connect|transfer)\s+me(?:\s+please)?[.!?]*$/i,
  /^ndibatanidz(?:e|ei)(?:\s+ndapota)?[.!?]*$/i,
];

function clean(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function isDirectHumanRequest(text: string): boolean {
  const value = clean(text);
  if (!value || NEGATED_HANDOFF.some((pattern) => pattern.test(value))) return false;
  return DIRECT_HANDOFF.some((pattern) => pattern.test(value));
}

export function isHumanHandoffOffer(text: string): boolean {
  const value = clean(text);
  return Boolean(value) && HANDOFF_OFFER.some((pattern) => pattern.test(value));
}

export function isAffirmativeHandoffReply(text: string): boolean {
  const value = clean(text);
  if (!value || /^(?:no|nope|not now|kwete)\b/i.test(value)) return false;
  return AFFIRMATIVE.some((pattern) => pattern.test(value));
}

/**
 * A handoff is confirmed when the customer asks for a person explicitly, or
 * when they give a clear affirmative answer to the bot's immediately preceding
 * handoff offer. A bare "yes" without that offer is deliberately not enough.
 */
export function hasConfirmedHumanHandoff(messages: SimpleMessage[]): boolean {
  const latestUserIndex = messages.findLastIndex((message) => message.role === "user");
  if (latestUserIndex < 0) return false;
  const latestUser = messages[latestUserIndex].content;
  if (isDirectHumanRequest(latestUser)) return true;
  if (!isAffirmativeHandoffReply(latestUser)) return false;

  const previousAssistant = [...messages.slice(0, latestUserIndex)]
    .reverse()
    .find((message) => message.role === "assistant");
  return Boolean(previousAssistant && isHumanHandoffOffer(previousAssistant.content));
}

export function isLikelyShona(languageHint: string) {
  return /(?:shona|chishona|sn(?:-|\b)|\b(?:hongu|kwete|ndapota|ndibatanidz\w*|ndinoda|munhu|maneja|mushandi|makadii|zvakanaka|ndiri|handi\w*|munogona|batsir\w*)\b)/i.test(languageHint);
}

export function handoffAcknowledgement(languageHint: string, channel: "voice" | "chat" | "sms" | "whatsapp") {
  const shona = isLikelyShona(languageHint);
  if (channel === "voice") {
    return shona
      ? "Hongu. Ndiri kukubatanidzai nemunhu wechikwata. Ndapota rambai muri parunhare."
      : "Certainly. Please hold while I connect you to a team member.";
  }
  return shona
    ? "Hongu. Ndazivisa munhu wechikwata uye AI yamira kupindura pano. Vachakupindurai muhurukuro ino."
    : "Thanks — I've notified the team and paused the AI in this conversation. A team member will reply here.";
}

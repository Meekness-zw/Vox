import type { ToolContext } from "./agent-tools";
import { requestPythonReply } from "./python-bot";
import type { Agent } from "./types";

export type { ToolContext };

export type SimpleMessage = { role: "user" | "assistant"; content: string };

/**
 * The knowledge base excerpt that grounds the demo agent. In production this
 * would be retrieved from a vector store (semantic search over the synced
 * sources in the Knowledge Base) and injected as context per request.
 */
export const demoKnowledgeBase = `
BUSINESS: Bright Smile Dental
HOURS: Mon–Fri 8am–6pm, Sat 9am–1pm, closed Sunday.
LOCATION: 1200 Market St, San Francisco, CA.
SERVICES & PRICING:
- New patient exam + X-rays: $89
- Routine cleaning: $120 (about 45 minutes)
- Teeth whitening (in-office): $349, financing available
- Fillings: from $180
- Emergency visit: same-day slots usually available
INSURANCE: We accept Delta Dental, Cigna, Aetna, and MetLife. We can verify coverage before the visit.
BOOKING: Appointments can be booked Mon–Sat during business hours. Typical availability within 2–3 days.
PARKING: Free validated parking in the building garage.
`.trim();

/** Agents whose `language` names more than one language get a code-switching instruction. */
function isMultilingual(language: string) {
  return /multi-language|\+|code-switch|shona/i.test(language);
}

export function buildSystemPrompt(
  agent: Agent,
  knowledge = demoKnowledgeBase,
  toolsEnabled = false
) {
  return [
    `You are "${agent.name}", an AI ${agent.type} agent for a business.`,
    `Personality: ${agent.personality}.`,
    agent.type === "voice"
      ? "This is a phone call: keep responses short, natural, and easy to say out loud. Never use markdown, lists, or emojis."
      : "This is a text chat: be friendly and concise. Light emoji use is fine.",
    `Business hours: ${agent.businessHours}.`,
    `Escalation rule: ${agent.escalation}`,
    "",
    ...(isMultilingual(agent.language)
      ? [
          `Language: ${agent.language}. Detect the language(s) the person is writing or speaking in this turn — including natural code-switching between English and Shona — and reply fluently in the same language or mix. Never force a translation the person didn't ask for.`,
          "",
        ]
      : []),
    "Use ONLY the following knowledge base to answer questions about the business. If something is not covered, say you'll have a team member follow up and offer to take their name and number.",
    toolsEnabled
      ? "When someone wants to book, use the check_availability and book_appointment tools to actually reserve a real slot — never just say it's booked without calling book_appointment. Once a service and price are agreed and you have their email, use create_invoice to send them a real invoice. Always confirm details back to the person after a tool call succeeds, and speak/write naturally about the result rather than describing that you used a tool."
      : "When a caller wants to book, confirm the service, offer a specific day/time, and confirm the booking. Capture their name and phone/email for follow-up.",
    "",
    "KNOWLEDGE BASE:",
    knowledge,
  ].join("\n");
}

/** True when a real model can be reached via the Vercel AI Gateway. */
export function hasModelCredentials() {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
  );
}

/** Default model id routed through the Vercel AI Gateway. */
export const DEFAULT_MODEL = process.env.VOX_MODEL ?? "anthropic/claude-haiku-4-5";

/**
 * Non-streaming reply used by the voice loop (TwiML needs the full utterance)
 * and as the shared fallback brain. Uses a real model via the AI Gateway when
 * credentials exist, otherwise the built-in knowledge-base responder.
 */
export async function generateReply(
  agent: Agent,
  messages: SimpleMessage[],
  /** Retrieved knowledge-base context for this turn (from RAG), if any. */
  retrievedKnowledge?: string,
  /**
   * When present, enables tool-calling (real appointment booking + invoicing)
   * scoped to this workspace/conversation. Omit to keep today's talk-only
   * behavior (e.g. the public marketing demo, which should never write data).
   */
  toolContext?: ToolContext
): Promise<string> {
  const knowledge = retrievedKnowledge?.trim() || demoKnowledgeBase;
  return requestPythonReply({
    workspaceId: toolContext?.workspaceId ?? "ws_demo",
    agent,
    messages,
    knowledge,
    channel: agent.type === "voice" ? "voice" : "chat",
  });
}

/**
 * Lightweight keyword responder used when no AI Gateway key is set. Grounds
 * answers in the same knowledge base the real model would use, so the chat
 * demo and voice loop both work with zero configuration.
 */
export function knowledgeReply(input: string, agentName: string): string {
  return (
    keywordMatch(input, agentName) ??
    "Great question. Let me have a team member follow up with the details. Could I take your name and the best number to reach you?"
  );
}

/** Returns a canned answer for a recognized intent, or null if none match. */
function keywordMatch(input: string, agentName: string): string | null {
  const q = input.toLowerCase();
  // Word-boundary (prefix) match so "clean" hits "cleaning" but "this" never
  // hits "hi". Avoids loose-substring false positives that short-circuit RAG.
  const match = (...keys: string[]) =>
    keys.some((k) =>
      new RegExp("\\b" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(q)
    );

  if (!input) {
    return `Hi there, I'm ${agentName}! I can help with our services, hours, pricing, or getting you booked in. What can I do for you?`;
  }
  if (match("hour", "open", "close", "when are you")) {
    return "Sure! We're open Monday through Friday, eight to six, and Saturdays nine to one. We're closed on Sundays. Want me to find you a time?";
  }
  if (match("clean", "cleaning")) {
    return "A cleaning's a hundred and twenty dollars, and it takes about forty-five minutes. I've actually got a few openings this week — would you like me to grab one for you?";
  }
  if (match("whiten", "whitening")) {
    return "Of course! In-office whitening is three forty-nine, and we do offer financing if that helps. Want me to get you scheduled?";
  }
  if (match("insurance", "delta", "cigna", "aetna", "metlife", "cover")) {
    return "Good news — we take Delta Dental, Cigna, Aetna, and MetLife, and we're happy to check your coverage before you come in. Who's your provider?";
  }
  if (match("price", "cost", "how much", "fee")) {
    return "Happy to help! A new-patient exam with X-rays is eighty-nine dollars, cleanings are a hundred and twenty, and fillings start at one eighty. Is there something specific you had in mind?";
  }
  if (match("book", "appointment", "schedule", "available", "slot")) {
    return "Absolutely, I can set that up. We've usually got openings within a couple of days. What day works best for you — and can I grab your name and number?";
  }
  if (match("park", "parking", "address", "location", "where are you")) {
    return "We're right at twelve hundred Market Street in San Francisco, and there's free validated parking in the building garage.";
  }
  if (match("emergency", "pain", "urgent", "hurts")) {
    return "Oh no, I'm so sorry you're hurting. We keep same-day emergency slots open — let me grab your name and number and we'll get you seen today, okay?";
  }
  if (match("bye", "goodbye", "that's all", "nothing else", "thank you")) {
    return "You're so welcome! Thanks for calling Bright Smile Dental — take care and have a great day.";
  }
  if (match("hi", "hello", "hey", "good morning", "good afternoon")) {
    return `Hey there! I'm ${agentName}. I can help with services, pricing, hours, or booking you a visit — what can I do for you?`;
  }
  return null;
}

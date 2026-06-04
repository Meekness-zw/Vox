import { generateText } from "ai";
import type { Agent } from "./types";

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

export function buildSystemPrompt(agent: Agent, knowledge = demoKnowledgeBase) {
  return [
    `You are "${agent.name}", an AI ${agent.type} agent for a business.`,
    `Personality: ${agent.personality}.`,
    agent.type === "voice"
      ? "This is a phone call: keep responses short, natural, and easy to say out loud. Never use markdown, lists, or emojis."
      : "This is a text chat: be friendly and concise. Light emoji use is fine.",
    `Business hours: ${agent.businessHours}.`,
    `Escalation rule: ${agent.escalation}`,
    "",
    "Use ONLY the following knowledge base to answer questions about the business. If something is not covered, say you'll have a team member follow up and offer to take their name and number.",
    "When a caller wants to book, confirm the service, offer a specific day/time, and confirm the booking. Capture their name and phone/email for follow-up.",
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
  retrievedKnowledge?: string
): Promise<string> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const knowledge = retrievedKnowledge?.trim() || demoKnowledgeBase;

  if (hasModelCredentials()) {
    try {
      const { text } = await generateText({
        model: DEFAULT_MODEL,
        system: buildSystemPrompt(agent, knowledge),
        messages,
      });
      return text.trim();
    } catch {
      // fall through to the offline responder
    }
  }

  // Offline: prefer a crisp keyword answer; if none matches but RAG found
  // relevant content in the workspace's knowledge base, answer extractively
  // from it; otherwise use the generic responder.
  const input = lastUser?.content ?? "";
  const kw = keywordMatch(input, agent.name);
  if (kw) return kw;
  if (retrievedKnowledge?.trim()) {
    return extractiveAnswer(retrievedKnowledge, agent.name);
  }
  return knowledgeReply(input, agent.name);
}

/** Crude extractive answer used as an offline fallback for RAG hits. */
function extractiveAnswer(context: string, agentName: string): string {
  const top = context.split(/\n\n---\n\n/)[0].replace(/\s+/g, " ").trim();
  const snippet = top.length > 360 ? top.slice(0, 357) + "…" : top;
  return `${snippet}\n\nIs there anything else I can help you with? — ${agentName}`;
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
    return `Hi! I'm ${agentName}. I can help with our services, hours, pricing, or booking an appointment. What can I do for you?`;
  }
  if (match("hour", "open", "close", "when are you")) {
    return "We're open Monday to Friday 8am to 6pm, and Saturday 9am to 1pm. We're closed Sundays. Would you like to book a time?";
  }
  if (match("clean", "cleaning")) {
    return "A routine cleaning is $120 and takes about 45 minutes. I have openings in the next few days. Would you like me to book one for you?";
  }
  if (match("whiten", "whitening")) {
    return "In-office teeth whitening is $349, and we offer financing. Shall I get you scheduled?";
  }
  if (match("insurance", "delta", "cigna", "aetna", "metlife", "cover")) {
    return "We accept Delta Dental, Cigna, Aetna, and MetLife, and we can verify your coverage before the visit. What's your provider?";
  }
  if (match("price", "cost", "how much", "fee")) {
    return "A new patient exam with X-rays is $89, cleanings are $120, and fillings start at $180. Is there anything specific you'd like pricing on?";
  }
  if (match("book", "appointment", "schedule", "available", "slot")) {
    return "I'd be happy to book that. We usually have availability within two to three days during business hours. What day works best, and may I get your name and phone number?";
  }
  if (match("park", "parking", "address", "location", "where are you")) {
    return "We're at 1200 Market Street in San Francisco, with free validated parking in the building garage.";
  }
  if (match("emergency", "pain", "urgent", "hurts")) {
    return "I'm sorry you're in pain. We usually keep same-day emergency slots open. Can I get your name and number so we can get you seen today?";
  }
  if (match("bye", "goodbye", "that's all", "nothing else", "thank you")) {
    return "You're very welcome. Thanks for calling Bright Smile Dental, and have a great day!";
  }
  if (match("hi", "hello", "hey", "good morning", "good afternoon")) {
    return `Hi there! I'm ${agentName}. I can help with services, pricing, hours, or booking a visit. How can I help?`;
  }
  return null;
}

import type { ToolContext } from "./agent-tools";
import { requestPythonReply, type PythonBotAction } from "./python-bot";
import type { Agent } from "./types";
import { getAvailability, bookAppointment } from "./calendar";
import { createInvoice } from "./invoices";
import { createBusinessDocument } from "./business-documents";
import { getWorkspaceName } from "./repository";

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
  const workspaceId = toolContext?.workspaceId ?? "ws_demo";
  // Demo knowledge must never leak into a real client's bot simply because
  // that workspace has not uploaded knowledge yet.
  const knowledge =
    retrievedKnowledge?.trim() ||
    (workspaceId === "ws_demo"
      ? demoKnowledgeBase
      : "No approved company knowledge has been added yet.");
  let activeMessages = messages;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await requestPythonReply({
      workspaceId,
      agent,
      messages: activeMessages,
      knowledge,
      channel: toolContext?.channel ?? (agent.type === "voice" ? "voice" : "chat"),
    });
    if (!result.action) return result.reply;
    const actionResult = toolContext
      ? await executePythonAction(result.action, toolContext)
      : { error: "Actions are disabled in this public demo." };
    activeMessages = [
      ...activeMessages,
      {
        role: "user",
        content: `[TOOL_RESULT] ${result.action.name}: ${JSON.stringify(actionResult)}`,
      },
    ];
  }
  return "I couldn't complete that action safely. I'll arrange for a team member to follow up.";
}

function textArg(args: Record<string, unknown>, key: string, required = false, maximum = 2_000) {
  const value = typeof args[key] === "string" ? args[key].trim() : "";
  if (required && !value) throw new Error(`${key} is required`);
  if (value.length > maximum) throw new Error(`${key} is too long`);
  return value || undefined;
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`Number must be between ${minimum} and ${maximum}`);
  }
  return number;
}

function formatSlotLabel(iso: string, timezone: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  });
}

function lineItemsArg(args: Record<string, unknown>) {
  if (!Array.isArray(args.lineItems) || !args.lineItems.length) {
    throw new Error("At least one line item is required");
  }
  if (args.lineItems.length > 100) throw new Error("A document can contain at most 100 line items");
  return args.lineItems.map((raw) => {
    const item = raw as Record<string, unknown>;
    const description = textArg(item, "description", true, 1_000)!;
    const quantity = boundedNumber(item.quantity, 1, 0.01, 1_000_000);
    const unitPriceCents = boundedNumber(item.unitPriceCents, 0, 0, 10_000_000_000);
    return {
      description,
      quantity,
      unitPriceCents: Math.round(unitPriceCents),
      sku: textArg(item, "sku"),
    };
  });
}

async function executePythonAction(action: PythonBotAction, ctx: ToolContext) {
  try {
    const args = action.arguments;
    if (action.name === "check_availability") {
      const date = textArg(args, "date", true)!;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date");
      const result = await getAvailability(
        ctx.workspaceId,
        date,
        boundedNumber(args.serviceMinutes, 30, 10, 480)
      );
      return {
        timezone: result.timezone,
        slots: result.slots.slice(0, 8).map((startsAt) => ({
          startsAt,
          localTime: formatSlotLabel(startsAt, result.timezone),
        })),
      };
    }
    if (action.name === "book_appointment") {
      const appointment = await bookAppointment({
        workspaceId: ctx.workspaceId,
        agentId: ctx.agentId,
        conversationId: ctx.conversationId,
        contactName: textArg(args, "contactName", true)!,
        contactPhone: textArg(args, "contactPhone") ?? ctx.contactPhone,
        contactEmail: textArg(args, "contactEmail") ?? ctx.contactEmail,
        service: textArg(args, "service", true)!,
        startsAt: textArg(args, "startsAt", true)!,
        durationMinutes: boundedNumber(args.durationMinutes, 30, 10, 480),
      });
      return {
        appointmentId: appointment.id,
        startsAt: appointment.startsAt,
        addedToGoogleCalendar: Boolean(appointment.googleEventId),
      };
    }
    if (action.name === "create_invoice") {
      const contactEmail = textArg(args, "contactEmail") ?? ctx.contactEmail;
      if (!contactEmail) throw new Error("Customer email is required");
      const result = await createInvoice({
        workspaceId: ctx.workspaceId,
        agentId: ctx.agentId,
        conversationId: ctx.conversationId,
        contactName: textArg(args, "contactName", true)!,
        contactEmail,
        lineItems: lineItemsArg(args),
        notes: textArg(args, "notes"),
        businessName: await getWorkspaceName(ctx.workspaceId),
      });
      return {
        invoiceId: result.invoice.id,
        totalCents: result.invoice.totalCents,
        emailed: result.emailed,
      };
    }
    const document = await createBusinessDocument({
      workspaceId: ctx.workspaceId,
      agentId: ctx.agentId,
      conversationId: ctx.conversationId,
      type: textArg(args, "type", true)! as
        | "receipt"
        | "quotation"
        | "delivery_order"
        | "purchase_order"
        | "credit_note",
      contactName: textArg(args, "contactName", true)!,
      contactEmail: textArg(args, "contactEmail") ?? ctx.contactEmail,
      contactPhone: textArg(args, "contactPhone") ?? ctx.contactPhone,
      contactAddress: textArg(args, "contactAddress"),
      lineItems: lineItemsArg(args),
      taxRatePercent: boundedNumber(args.taxRatePercent, 0, 0, 100),
      notes: textArg(args, "notes"),
      dueDate: textArg(args, "dueDate"),
      metadata: {
        deliveryReference: textArg(args, "deliveryReference") ?? "",
      },
    });
    return {
      documentId: document.id,
      documentNumber: document.number,
      totalCents: document.totalCents,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Action failed" };
  }
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

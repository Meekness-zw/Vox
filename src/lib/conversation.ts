import type { SimpleMessage } from "@/lib/agent-runtime";
import type { Conversation } from "@/lib/types";

type Analysis = {
  summary: string;
  sentiment: Conversation["sentiment"];
  outcome: Conversation["outcome"];
  actionItems: string[];
};

/**
 * Derive a summary, sentiment, outcome, and action items from a transcript.
 * Heuristic so it works offline; a model pass can replace this when the AI
 * Gateway is reachable (the seam is here).
 */
export function analyzeConversation(messages: SimpleMessage[]): Analysis {
  const userText = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ")
    .toLowerCase();
  const agentText = messages
    .filter((m) => m.role === "assistant")
    .map((m) => m.content)
    .join(" ")
    .toLowerCase();
  const all = `${userText} ${agentText}`;

  // Sentiment
  let sentiment: Conversation["sentiment"] = "neutral";
  if (/(thank|great|perfect|awesome|wonderful|appreciate)/.test(userText))
    sentiment = "positive";
  if (/(angry|frustrat|terrible|not happy|charged twice|ridiculous|upset|worst)/.test(userText))
    sentiment = "negative";

  // Outcome
  let outcome: Conversation["outcome"] = "answered";
  if (/(transfer|human|speak to|talk to someone|representative|billing team)/.test(all))
    outcome = "transferred";
  else if (/(booked|scheduled|see you|that's booked|i've booked|confirmed for|appointment is set)/.test(agentText))
    outcome = "booked";
  else if (/(email|phone number|name and number|follow up|reach you|send (you )?details)/.test(agentText))
    outcome = "lead";

  // Summary
  const firstUser =
    messages.find((m) => m.role === "user")?.content?.trim() ?? "";
  const topic =
    firstUser.length > 120 ? firstUser.slice(0, 117) + "…" : firstUser;
  const outcomeLabel: Record<Conversation["outcome"], string> = {
    booked: "Appointment booked.",
    lead: "Lead captured for follow-up.",
    answered: "Question answered.",
    transferred: "Transferred to a team member.",
    missed: "Call missed.",
  };
  const summary = topic
    ? `${topic} — ${outcomeLabel[outcome]}`
    : outcomeLabel[outcome];

  // Action items
  const actionItems: string[] = [];
  if (outcome === "booked") actionItems.push("Send appointment confirmation SMS");
  if (outcome === "lead") actionItems.push("Follow up with the captured contact");
  if (outcome === "transferred") actionItems.push("Team member to follow up");

  return { summary, sentiment, outcome, actionItems };
}

/** Build a Conversation record from a transcript + metadata. */
export function buildConversation(opts: {
  id: string;
  agentId: string;
  channel: Conversation["channel"];
  contact: string;
  startedAt: string;
  durationSec: number;
  messages: SimpleMessage[];
}): Conversation {
  const { summary, sentiment, outcome, actionItems } = analyzeConversation(
    opts.messages
  );
  return {
    id: opts.id,
    agentId: opts.agentId,
    channel: opts.channel,
    contact: opts.contact,
    startedAt: opts.startedAt,
    durationSec: opts.durationSec,
    sentiment,
    outcome,
    summary,
    actionItems,
    transcript: opts.messages.map((m) => ({
      role: m.role === "user" ? "caller" : "agent",
      text: m.content,
    })),
  };
}

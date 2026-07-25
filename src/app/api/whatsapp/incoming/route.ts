import { generateReply, type SimpleMessage } from "@/lib/agent-runtime";
import { retrieveContext } from "@/lib/rag";
import { buildConversation } from "@/lib/conversation";
import {
  getAgentById,
  getConversationById,
  getRoutingForNumber,
  upsertConversation,
} from "@/lib/repository";
import { messageReply } from "@/lib/voice/twiml";
import { formDataToParams, isValidTwilioRequest, publicWebhookUrl } from "@/lib/twilio-signature";

export const maxDuration = 30;

const MAX_THREAD_TURNS = 40;

/**
 * Twilio WhatsApp inbound webhook. Point a Twilio WhatsApp sender's "When a
 * message comes in" webhook at: POST https://<your-app>/api/whatsapp/incoming
 *
 * Unlike voice (one call = one in-memory session), WhatsApp has no
 * start/end signal and the serverless instance handling this request may
 * never see the next message from the same contact — so the conversation
 * thread is loaded from and saved back to the database on every turn.
 */
export async function POST(req: Request) {
  const form = await req.formData();

  if (
    !isValidTwilioRequest({
      signatureHeader: req.headers.get("x-twilio-signature"),
      url: publicWebhookUrl(req),
      params: formDataToParams(form),
    })
  ) {
    return new Response("Invalid signature", { status: 403 });
  }

  const from = String(form.get("From") ?? "").replace(/^whatsapp:/, "");
  const to = String(form.get("To") ?? "").replace(/^whatsapp:/, "");
  const body = String(form.get("Body") ?? "").trim();
  if (!from || !body) return messageReply("Sorry, I didn't get that — could you resend?");

  const route = await getRoutingForNumber(to, "whatsapp");
  if (!route) {
    return messageReply("Sorry, this number isn't set up yet. Please try again later.");
  }

  const agent = await getAgentById(route.agentId, route.workspaceId);
  if (!agent) {
    return messageReply("Sorry, something went wrong on our end. Please try again later.");
  }

  const threadId = "wa_" + route.workspaceId + "_" + from.replace(/[^a-zA-Z0-9]/g, "");
  const existing = await getConversationById(threadId, route.workspaceId);

  const history: SimpleMessage[] = (existing?.transcript ?? [])
    .slice(-MAX_THREAD_TURNS)
    .map((t) => ({ role: t.role === "agent" ? "assistant" : "user", content: t.text }));
  history.push({ role: "user", content: body });

  const ctx = await retrieveContext(route.workspaceId, body);
  const reply = await generateReply(agent, history, ctx?.text, {
    workspaceId: route.workspaceId,
    agentId: agent.id,
    channel: "whatsapp",
    conversationId: threadId,
    contactPhone: from,
  });
  history.push({ role: "assistant", content: reply });

  const startedAt = existing?.startedAt ?? new Date().toISOString();
  const record = buildConversation({
    id: threadId,
    agentId: agent.id,
    channel: "whatsapp",
    contact: from,
    startedAt,
    durationSec: Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)),
    messages: history,
  });
  await upsertConversation(record, route.workspaceId);

  return messageReply(reply);
}

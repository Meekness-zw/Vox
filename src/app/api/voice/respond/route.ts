import { generateReply } from "@/lib/agent-runtime";
import { retrieveContext } from "@/lib/rag";
import { buildConversation } from "@/lib/conversation";
import {
  getAgentById,
  getRoutingForNumber,
  upsertConversation,
} from "@/lib/repository";
import {
  sayAndGather,
  sayAndHangup,
  isClosing,
  getSession,
  startSession,
  endSession,
} from "@/lib/voice/twiml";
import { formDataToParams, isValidTwilioRequest, publicWebhookUrl } from "@/lib/twilio-signature";

export const maxDuration = 30;

/**
 * Twilio <Gather> action webhook. Receives the caller's transcribed speech,
 * runs it through the agent (real model via AI Gateway, or the offline
 * responder), speaks the reply, and listens again — a full STT → LLM → TTS
 * voice loop.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
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

  const callSid = String(form.get("CallSid") ?? `local_${Date.now()}`);
  const from = String(form.get("From") ?? "unknown");
  const to = String(form.get("To") ?? "unknown");
  const speech = String(form.get("SpeechResult") ?? "").trim();

  let session = getSession(callSid);
  if (!session) {
    // Session lost (e.g. cold start) — re-resolve the route and start fresh.
    const route = await getRoutingForNumber(to, "voice");
    const workspaceId = route?.workspaceId ?? "ws_demo";
    const agentId = url.searchParams.get("agentId") ?? route?.agentId ?? "";
    session = startSession(callSid, agentId, from, workspaceId);
  }

  const agentId = url.searchParams.get("agentId") ?? session.agentId;
  const agent = await getAgentById(agentId, session.workspaceId);
  if (!agent) {
    return sayAndHangup("Sorry, something went wrong on our end. Please call back.");
  }

  // No speech detected — re-prompt once.
  if (!speech) {
    return sayAndGather(
      "Sorry, I didn't quite hear that. Could you say that again?",
      `/api/voice/respond?agentId=${encodeURIComponent(agentId)}`,
      agent.language
    );
  }

  session.messages.push({ role: "user", content: speech });
  const ctx = await retrieveContext(session.workspaceId, speech);
  const reply = await generateReply(agent, session.messages, ctx?.text, {
    workspaceId: session.workspaceId,
    agentId: agent.id,
    channel: "voice",
    conversationId: "cv_" + callSid,
    contactPhone: from,
  });
  session.messages.push({ role: "assistant", content: reply });

  // End the call when the caller says goodbye or the agent closes out.
  if (isClosing(speech) || isClosing(reply)) {
    const ended = endSession(callSid);
    if (ended) {
      const durationSec = Math.max(
        1,
        Math.round((Date.now() - new Date(ended.startedAt).getTime()) / 1000)
      );
      const record = buildConversation({
        id: "cv_" + callSid,
        agentId: ended.agentId,
        channel: "voice",
        contact: ended.from,
        startedAt: ended.startedAt,
        durationSec,
        messages: ended.messages,
      });
      // Persist the completed call so it appears in the dashboard.
      await upsertConversation(record, ended.workspaceId);
    }
    return sayAndHangup(reply);
  }

  return sayAndGather(
    reply,
    `/api/voice/respond?agentId=${encodeURIComponent(agentId)}`,
    agent.language
  );
}

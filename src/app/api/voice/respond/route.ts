import { generateReply } from "@/lib/agent-runtime";
import { retrieveContext } from "@/lib/rag";
import { buildConversation } from "@/lib/conversation";
import {
  appendBotMessageIfAutomationActive,
  appendConversationMessage,
  ensureInboxConversation,
  getAgentById,
  getCompanyProfile,
  getConversationAutomationState,
  getRoutingForNumber,
  requestHumanHandoff,
  upsertConversation,
} from "@/lib/repository";
import {
  sayAndGather,
  sayAndHangup,
  isClosing,
  getSession,
  startSession,
  saveSession,
  endSession,
  twimlResponse,
} from "@/lib/voice/twiml";
import { formDataToParams, isValidTwilioRequest, publicWebhookUrl } from "@/lib/twilio-signature";
import { isDbEnabled } from "@/lib/db";
import { handoffAcknowledgement, hasConfirmedHumanHandoff, isLikelyShona } from "@/lib/handoff-detection";
import { directTransferResponse } from "@/lib/voice/handoff";

export const maxDuration = 30;

export async function POST(req: Request) {
  const url = new URL(req.url);
  const form = await req.formData();
  if (!isValidTwilioRequest({
    signatureHeader: req.headers.get("x-twilio-signature"),
    url: publicWebhookUrl(req),
    params: formDataToParams(form),
  })) return new Response("Invalid signature", { status: 403 });

  const callSid = String(form.get("CallSid") ?? "");
  const from = String(form.get("From") ?? "unknown");
  const to = String(form.get("To") ?? "unknown");
  const speech = String(form.get("SpeechResult") ?? "").trim();
  const requestedTurn = Math.max(1, Number(url.searchParams.get("turn") ?? 1) || 1);
  if (!/^CA[0-9a-fA-F]{32}$/.test(callSid)) {
    return new Response("Invalid call", { status: 400 });
  }

  let session = await getSession(callSid);
  if (!session) {
    const route = await getRoutingForNumber(to, "voice");
    const workspaceId = route?.workspaceId ?? (isDbEnabled ? "" : "ws_demo");
    const agentId = url.searchParams.get("agentId") ?? route?.agentId ?? "";
    if (!workspaceId || !agentId) {
      return sayAndHangup("Sorry, this number isn't set up yet. Please try again later.");
    }
    session = await startSession(callSid, agentId, from, workspaceId);
  }

  const agentId = url.searchParams.get("agentId") ?? session.agentId;
  const agent = await getAgentById(agentId, session.workspaceId);
  if (!agent || agent.status !== "active") {
    return sayAndHangup("Sorry, the assistant is unavailable right now. Please call back later.");
  }
  if (!speech) {
    return sayAndGather(
      "Sorry, I didn't quite hear that. Could you say that again?",
      `/api/voice/respond?agentId=${encodeURIComponent(agentId)}&turn=${requestedTurn}`,
      agent.language
    );
  }

  const conversationId = `cv_${callSid}`;
  await ensureInboxConversation({
    id: conversationId,
    workspaceId: session.workspaceId,
    agentId,
    channel: "voice",
    contact: session.from,
    businessAddress: to,
    startedAt: session.startedAt,
  });
  const inbound = await appendConversationMessage({
    workspaceId: session.workspaceId,
    conversationId,
    authorType: "customer",
    body: speech,
    channel: "voice",
    direction: "inbound",
    deliveryStatus: "delivered",
    idempotencyKey: `twilio:voice:${callSid}:gather:${requestedTurn}`,
  });
  if (!inbound.created) return twimlResponse("");
  session.messages.push({ role: "user", content: speech });
  await saveSession(callSid, session);

  const state = await getConversationAutomationState(conversationId, session.workspaceId);
  if (!state || state.inboxStatus !== "ai_active" || state.botMode !== "active") {
    return twimlResponse("");
  }

  if (hasConfirmedHumanHandoff(session.messages)) {
    await requestHumanHandoff({
      workspaceId: session.workspaceId,
      conversationId,
      reason: "Caller explicitly confirmed a human transfer.",
      priority: "high",
    });
    const acknowledgement = handoffAcknowledgement(speech, "voice");
    const profile = await getCompanyProfile(session.workspaceId);
    const reply = profile?.transferPhone
      ? acknowledgement
      : isLikelyShona(speech)
        ? "Ndachengeta chikumbiro chekuti munhu wechikwata akufonerei."
        : "I've saved a callback request and a team member will contact you.";
    session.messages.push({ role: "assistant", content: reply });
    await saveSession(callSid, session);
    await appendConversationMessage({
      workspaceId: session.workspaceId,
      conversationId,
      authorType: "bot",
      body: reply,
      channel: "voice",
      direction: "outbound",
      deliveryStatus: "sent",
      idempotencyKey: `twilio:voice:${callSid}:gather:${requestedTurn}:handoff`,
    });
    await upsertConversation(buildConversation({
      id: conversationId,
      agentId,
      channel: "voice",
      contact: session.from,
      startedAt: session.startedAt,
      durationSec: Math.max(1, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000)),
      messages: session.messages,
    }), session.workspaceId);
    if (profile?.transferPhone) {
      try {
        return directTransferResponse({
          workspaceId: session.workspaceId,
          callSid,
          transferPhone: profile.transferPhone,
          callerId: to,
          acknowledgement,
        });
      } catch {
        return sayAndHangup("The transfer could not be started. A team member will call you back.");
      }
    }
    return sayAndHangup(reply);
  }

  const context = await retrieveContext(session.workspaceId, speech);
  const reply = await generateReply(agent, session.messages, context?.text, {
    workspaceId: session.workspaceId,
    agentId: agent.id,
    channel: "voice",
    conversationId,
    contactPhone: from,
  });
  const outgoing = await appendBotMessageIfAutomationActive({
    workspaceId: session.workspaceId,
    conversationId,
    body: reply,
    channel: "voice",
    deliveryStatus: "sent",
    idempotencyKey: `twilio:voice:${callSid}:gather:${requestedTurn}:bot`,
    expectedStateVersion: state.stateVersion,
  });
  if (!outgoing.created) return twimlResponse("");
  session.messages.push({ role: "assistant", content: reply });
  await saveSession(callSid, session);

  if (isClosing(speech) || isClosing(reply)) {
    const ended = await endSession(callSid);
    if (ended) {
      await upsertConversation(buildConversation({
        id: conversationId,
        agentId: ended.agentId,
        channel: "voice",
        contact: ended.from,
        startedAt: ended.startedAt,
        durationSec: Math.max(1, Math.round((Date.now() - new Date(ended.startedAt).getTime()) / 1000)),
        messages: ended.messages,
      }), ended.workspaceId);
    }
    return sayAndHangup(reply);
  }

  return sayAndGather(
    reply,
    `/api/voice/respond?agentId=${encodeURIComponent(agentId)}&turn=${requestedTurn + 1}`,
    agent.language
  );
}

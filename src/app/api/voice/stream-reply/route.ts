import { timingSafeEqual } from "node:crypto";
import { generateReply, type SimpleMessage } from "@/lib/agent-runtime";
import { buildConversation } from "@/lib/conversation";
import { retrieveContext } from "@/lib/rag";
import {
  addAuditEvent,
  appendBotMessageIfAutomationActive,
  appendConversationMessage,
  ensureInboxConversation,
  getAgentById,
  getCompanyProfile,
  getConversationAutomationState,
  requestHumanHandoff,
  upsertConversation,
} from "@/lib/repository";
import { bodyTooLarge } from "@/lib/api-security";
import { getSession as getVoiceSession } from "@/lib/voice/twiml";
import { handoffAcknowledgement, hasConfirmedHumanHandoff, isLikelyShona } from "@/lib/handoff-detection";
import { redirectLiveCallToHuman } from "@/lib/voice/handoff";

export const maxDuration = 30;

function authorized(req: Request) {
  const expected = process.env.VOX_BOT_SERVICE_TOKEN;
  const supplied = req.headers.get("authorization") ?? "";
  if (!expected) return false;
  const wanted = Buffer.from(`Bearer ${expected}`);
  const actual = Buffer.from(supplied);
  return wanted.length === actual.length && timingSafeEqual(wanted, actual);
}

function validIdentifier(value: string) {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}

function sanitizedMessages(value: unknown): SimpleMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-40).flatMap((raw) => {
    const message = raw as Partial<SimpleMessage> | null;
    if (!message || (message.role !== "user" && message.role !== "assistant") ||
        typeof message.content !== "string") return [];
    const content = message.content.trim();
    return content && content.length <= 4_000 ? [{ role: message.role, content }] : [];
  });
}

function callStartedAt(value: unknown) {
  const parsed = new Date(String(value ?? ""));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (bodyTooLarge(req, 256_000)) {
    return Response.json({ error: "Request is too large." }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const workspaceId = String(body.workspaceId ?? "");
  const agentId = String(body.agentId ?? "");
  const callSid = String(body.callSid ?? "");
  const messages = sanitizedMessages(body.messages);
  if (!validIdentifier(workspaceId) || !validIdentifier(agentId) ||
      !/^CA[0-9a-fA-F]{32}$/.test(callSid) || !messages.length) {
    return Response.json({ error: "Invalid call context" }, { status: 400 });
  }

  // A valid service token alone must not be able to mix tenants or redirect an
  // unrelated Twilio call. The call session was established by the signed
  // inbound Twilio webhook and is the authority for these identifiers.
  const callSession = await getVoiceSession(callSid);
  if (!callSession || callSession.workspaceId !== workspaceId || callSession.agentId !== agentId) {
    return Response.json({ error: "Call session mismatch" }, { status: 409 });
  }
  const agent = await getAgentById(agentId, workspaceId);
  if (!agent || agent.status !== "active") {
    return Response.json({ error: "Agent unavailable" }, { status: 404 });
  }

  const conversationId = `cv_${callSid}`;
  const startedAt = callStartedAt(body.startedAt);
  const languageMode = String(body.languageMode ?? "auto").toLowerCase();
  const caller = callSession.from;
  const called = String(body.called ?? "");
  await ensureInboxConversation({
    id: conversationId,
    workspaceId,
    agentId,
    channel: "voice",
    contact: caller,
    businessAddress: called || undefined,
    startedAt,
  });
  const userTurn = messages.filter((message) => message.role === "user").length;
  const latestUser = [...messages].reverse().find((message) => message.role === "user");
  if (!latestUser) return Response.json({ error: "No caller message" }, { status: 400 });
  const inbound = await appendConversationMessage({
    workspaceId,
    conversationId,
    authorType: "customer",
    body: latestUser.content,
    channel: "voice",
    direction: "inbound",
    deliveryStatus: "delivered",
    idempotencyKey: `twilio:voice:${callSid}:caller:${userTurn}`,
  });
  if (!inbound.created) {
    return Response.json({ reply: "", duplicate: true, paused: true });
  }

  let state = await getConversationAutomationState(conversationId, workspaceId);
  if (!state) return Response.json({ error: "Conversation unavailable" }, { status: 503 });
  if (state.inboxStatus !== "ai_active" || state.botMode !== "active") {
    return Response.json({ reply: "", paused: true });
  }

  if (hasConfirmedHumanHandoff(messages)) {
    await requestHumanHandoff({
      workspaceId,
      conversationId,
      reason: "Caller explicitly confirmed a human transfer.",
      priority: "high",
    });
    state = await getConversationAutomationState(conversationId, workspaceId) ?? state;
    const profile = await getCompanyProfile(workspaceId);
    const transferReply = handoffAcknowledgement(
      languageMode === "shona" ? "shona" : latestUser.content,
      "voice"
    );
    let reply = transferReply;
    let transferring = false;
    if (profile?.transferPhone) {
      try {
        await redirectLiveCallToHuman({
          workspaceId,
          callSid,
          transferPhone: profile.transferPhone,
          callerId: called || undefined,
          acknowledgement: transferReply,
        });
        transferring = true;
        await addAuditEvent(workspaceId, "voice-bot", "call.transfer_started", {
          callSid,
          conversationId,
        });
      } catch (error) {
        reply = isLikelyShona(languageMode === "shona" ? "shona" : latestUser.content)
          ? "Pamusoroi, munhu wechikwata haana kukwanisa kubatika. Ndachengeta chikumbiro chekuti vakufonerei."
          : "I'm sorry, the team member could not be reached. I've saved a callback request for the team.";
        await addAuditEvent(workspaceId, "voice-bot", "call.transfer_start_failed", {
          callSid,
          conversationId,
          error: error instanceof Error ? error.message.slice(0, 300) : "Transfer failed",
        });
      }
    } else {
      reply = isLikelyShona(languageMode === "shona" ? "shona" : latestUser.content)
        ? "Ndachengeta chikumbiro chekuti munhu wechikwata akufonerei."
        : "I've saved a callback request and a team member will contact you.";
    }
    await appendConversationMessage({
      workspaceId,
      conversationId,
      authorType: "bot",
      body: reply,
      channel: "voice",
      direction: "outbound",
      deliveryStatus: "sent",
      idempotencyKey: `twilio:voice:${callSid}:handoff:${userTurn}`,
    });
    const complete = [...messages, { role: "assistant" as const, content: reply }];
    await upsertConversation(buildConversation({
      id: conversationId,
      agentId,
      channel: "voice",
      contact: caller,
      startedAt,
      durationSec: Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)),
      messages: complete,
    }), workspaceId);
    return Response.json({ reply, transferring, inboxStatus: state.inboxStatus });
  }

  const context = await retrieveContext(workspaceId, latestUser.content);
  const callAgent = languageMode === "shona"
    ? { ...agent, language: "CALL_LANGUAGE: Shona. Reply only in natural Shona unless the caller explicitly asks to switch to English." }
    : languageMode === "english"
      ? { ...agent, language: "CALL_LANGUAGE: English. Reply only in English unless the caller explicitly asks to switch to Shona." }
      : agent;
  const reply = await generateReply(callAgent, messages, context?.text, {
    workspaceId,
    agentId,
    channel: "voice",
    conversationId,
    contactPhone: caller,
  });
  const outgoing = await appendBotMessageIfAutomationActive({
    workspaceId,
    conversationId,
    body: reply,
    channel: "voice",
    deliveryStatus: "sent",
    idempotencyKey: `twilio:voice:${callSid}:bot:${userTurn}`,
    expectedStateVersion: state.stateVersion,
  });
  if (!outgoing.created) return Response.json({ reply: "", paused: true });

  const complete = [...messages, { role: "assistant" as const, content: reply }];
  await upsertConversation(buildConversation({
    id: conversationId,
    agentId,
    channel: "voice",
    contact: caller,
    startedAt,
    durationSec: Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)),
    messages: complete,
  }), workspaceId);
  return Response.json({ reply });
}

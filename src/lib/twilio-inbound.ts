import { generateReply, type SimpleMessage } from "./agent-runtime";
import { retrieveContext } from "./rag";
import { buildConversation } from "./conversation";
import {
  appendConversationMessage,
  appendBotMessageIfAutomationActive,
  claimWebhookEvent,
  completeWebhookEvent,
  ensureInboxConversation,
  getAgentById,
  getConversationAutomationState,
  getConversationById,
  getRoutingForNumber,
  listConversationMessages,
  releaseWebhookEvent,
  requestHumanHandoff,
  upsertConversation,
} from "./repository";
import { bodyTooLarge } from "./api-security";
import { handoffAcknowledgement, hasConfirmedHumanHandoff } from "./handoff-detection";
import { messageReply, twimlResponse } from "./voice/twiml";
import { formDataToParams, isValidTwilioRequest, publicWebhookUrl } from "./twilio-signature";

type MessagingChannel = "sms" | "whatsapp";

const MAX_THREAD_TURNS = 40;
const MAX_MESSAGE_LENGTH = 4_000;

function normalizeAddress(value: FormDataEntryValue | null) {
  return String(value ?? "").replace(/^whatsapp:/i, "").trim();
}

function validProviderSid(value: string) {
  return /^[A-Z]{2}[0-9a-fA-F]{32}$/.test(value);
}

function publicHistory(
  rows: Awaited<ReturnType<typeof listConversationMessages>>
): SimpleMessage[] {
  return rows
    .filter((message) => message.authorType !== "system")
    .map((message) => ({
      role: message.authorType === "customer" ? "user" as const : "assistant" as const,
      content: message.body,
    }))
    .filter((message) => message.content.trim().length > 0)
    .slice(-MAX_THREAD_TURNS);
}

function threadId(channel: MessagingChannel, workspaceId: string, from: string) {
  const contact = from.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40);
  return `${channel === "whatsapp" ? "wa" : "sms"}_${workspaceId}_${contact}`;
}

/** Shared, tenant-routed Twilio inbound flow for SMS and WhatsApp. */
export async function handleTwilioInboundMessage(req: Request, channel: MessagingChannel) {
  if (bodyTooLarge(req, 256_000)) {
    return new Response("Request is too large", { status: 413 });
  }
  const form = await req.formData();
  if (!isValidTwilioRequest({
    signatureHeader: req.headers.get("x-twilio-signature"),
    url: publicWebhookUrl(req),
    params: formDataToParams(form),
  })) {
    return new Response("Invalid signature", { status: 403 });
  }

  const from = normalizeAddress(form.get("From"));
  const to = normalizeAddress(form.get("To"));
  const rawBody = String(form.get("Body") ?? "").trim();
  const messageSid = String(form.get("MessageSid") ?? "").trim();
  const mediaCount = Math.max(0, Number(form.get("NumMedia") ?? 0) || 0);
  const body = rawBody || (mediaCount ? "[Customer sent media that requires human review]" : "");

  if (!from || !to || !validProviderSid(messageSid)) {
    return new Response("Invalid Twilio message", { status: 400 });
  }
  if (!body || body.length > MAX_MESSAGE_LENGTH) {
    return messageReply("Sorry, I couldn't read that message. Please send a shorter text message.");
  }

  const eventId = `twilio:${channel}:${messageSid}`;
  const claim = await claimWebhookEvent(eventId, `twilio_${channel}`);
  if (!claim.claimed) {
    return claim.responseText ? messageReply(claim.responseText) : twimlResponse("");
  }

  try {
    const route = await getRoutingForNumber(to, channel);
    if (!route) {
      const reply = "Sorry, this number isn't set up yet. Please try again later.";
      await completeWebhookEvent(eventId, reply);
      return messageReply(reply);
    }

    const agent = await getAgentById(route.agentId, route.workspaceId);
    if (!agent || agent.status !== "active") {
      const reply = "Sorry, the assistant is unavailable right now. Please try again later.";
      await completeWebhookEvent(eventId, reply);
      return messageReply(reply);
    }

    const conversationId = threadId(channel, route.workspaceId, from);
    const existing = await getConversationById(conversationId, route.workspaceId);
    const startedAt = existing?.startedAt ?? new Date().toISOString();
    await ensureInboxConversation({
      id: conversationId,
      workspaceId: route.workspaceId,
      agentId: agent.id,
      channel,
      contact: from,
      businessAddress: to,
      startedAt,
    });
    const inbound = await appendConversationMessage({
      workspaceId: route.workspaceId,
      conversationId,
      authorType: "customer",
      body,
      channel,
      direction: "inbound",
      deliveryStatus: "delivered",
      providerMessageSid: messageSid,
      idempotencyKey: eventId,
    });
    if (!inbound.created) {
      await completeWebhookEvent(eventId);
      return twimlResponse("");
    }

    const state = await getConversationAutomationState(conversationId, route.workspaceId);
    if (!state || state.inboxStatus !== "ai_active" || state.botMode !== "active") {
      await completeWebhookEvent(eventId);
      return twimlResponse("");
    }

    const rows = await listConversationMessages(conversationId, route.workspaceId, {
      limit: MAX_THREAD_TURNS,
      customerVisibleOnly: true,
    });
    const history = publicHistory(rows);
    const confirmedHandoff = mediaCount > 0 || hasConfirmedHumanHandoff(history);
    if (confirmedHandoff) {
      const reason = mediaCount > 0
        ? "Customer sent media that requires human review."
        : "Customer explicitly requested a human team member.";
      await requestHumanHandoff({
        workspaceId: route.workspaceId,
        conversationId,
        reason,
        priority: mediaCount > 0 ? "normal" : "high",
      });
      const reply = handoffAcknowledgement(body, channel);
      await appendConversationMessage({
        workspaceId: route.workspaceId,
        conversationId,
        authorType: "bot",
        body: reply,
        channel,
        direction: "outbound",
        deliveryStatus: "sent",
        idempotencyKey: `${eventId}:handoff-ack`,
      });
      const complete = [...history, { role: "assistant" as const, content: reply }];
      await upsertConversation(buildConversation({
        id: conversationId,
        agentId: agent.id,
        channel,
        contact: from,
        startedAt,
        durationSec: Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)),
        messages: complete,
      }), route.workspaceId);
      await completeWebhookEvent(eventId, reply);
      return messageReply(reply);
    }

    const latestCustomerMessage = [...history].reverse()
      .find((message) => message.role === "user")?.content ?? body;
    const context = await retrieveContext(route.workspaceId, latestCustomerMessage);
    const reply = await generateReply(agent, history, context?.text, {
      workspaceId: route.workspaceId,
      agentId: agent.id,
      channel,
      conversationId,
      contactPhone: from,
    });
    const outgoing = await appendBotMessageIfAutomationActive({
      workspaceId: route.workspaceId,
      conversationId,
      body: reply,
      channel,
      deliveryStatus: "sent",
      idempotencyKey: `${eventId}:bot-reply`,
      expectedStateVersion: state.stateVersion,
    });
    if (!outgoing.created) {
      await completeWebhookEvent(eventId);
      return twimlResponse("");
    }

    const complete = [...history, { role: "assistant" as const, content: reply }];
    await upsertConversation(buildConversation({
      id: conversationId,
      agentId: agent.id,
      channel,
      contact: from,
      startedAt,
      durationSec: Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)),
      messages: complete,
    }), route.workspaceId);
    await completeWebhookEvent(eventId, reply);
    return messageReply(reply);
  } catch (error) {
    await releaseWebhookEvent(eventId);
    throw error;
  }
}

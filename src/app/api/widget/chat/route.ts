import { generateReply, type SimpleMessage } from "@/lib/agent-runtime";
import { buildConversation } from "@/lib/conversation";
import { retrieveContext } from "@/lib/rag";
import {
  appendConversationMessage,
  appendBotMessageIfAutomationActive,
  consumeWidgetRateLimit,
  ensureInboxConversation,
  getAgentById,
  getConversationAutomationState,
  getConversationById,
  getWidgetByToken,
  listConversationMessages,
  requestHumanHandoff,
  upsertConversation,
} from "@/lib/repository";
import { syncCrmLead } from "@/lib/crm";
import { allowRequest, bodyTooLarge } from "@/lib/api-security";
import {
  signWidgetThread,
  verifyWidgetEmbed,
  verifyWidgetThread,
} from "@/lib/widget-auth";
import { handoffAcknowledgement, hasConfirmedHumanHandoff } from "@/lib/handoff-detection";

export const maxDuration = 30;

const MAX_THREAD_TURNS = 40;

function allowedDomains(config: Record<string, unknown>) {
  return Array.isArray(config.allowed_domains) ? config.allowed_domains.map(String) : [];
}

function validEmbed(config: Record<string, unknown>, token: string, proof: string) {
  const allowed = allowedDomains(config);
  return !allowed.length || verifyWidgetEmbed(proof, token, allowed);
}

function safeConversationId(value: unknown) {
  const supplied = String(value ?? "");
  return /^[a-zA-Z0-9_-]{16,100}$/.test(supplied) ? supplied : "";
}

function apiConversationId(workspaceId: string, suppliedId: string) {
  return `widget_${workspaceId}_${suppliedId}`;
}

function asModelHistory(rows: Awaited<ReturnType<typeof listConversationMessages>>): SimpleMessage[] {
  return rows
    .filter((message) => message.authorType !== "system")
    .map((message) => ({
      role: message.authorType === "customer" ? "user" as const : "assistant" as const,
      content: message.body,
    }))
    .filter((message) => message.content.trim())
    .slice(-MAX_THREAD_TURNS);
}

function publicMessage(message: Awaited<ReturnType<typeof appendConversationMessage>>["message"]) {
  return {
    id: message.id,
    sequence: message.sequence,
    role: message.authorType === "customer" ? "user" as const : "assistant" as const,
    authorType: message.authorType,
    authorName: message.authorName,
    content: message.body,
    createdAt: message.createdAt,
  };
}

/** Poll customer-visible bot/staff replies for an existing random widget thread. */
export async function GET(req: Request) {
  if (!(await allowRequest(req, "widget-poll", 120))) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const proof = url.searchParams.get("embedProof") ?? "";
  const threadProof = url.searchParams.get("threadToken") ?? "";
  const suppliedId = safeConversationId(url.searchParams.get("conversationId"));
  const afterSequence = Math.max(0, Number(url.searchParams.get("after") ?? 0) || 0);
  const config = await getWidgetByToken(token);
  if (!config) return Response.json({ error: "Widget not found" }, { status: 404 });
  if (!validEmbed(config, token, proof)) {
    return Response.json({ error: "Embedding domain is not approved" }, { status: 403 });
  }
  if (!suppliedId) return Response.json({ error: "Invalid conversation" }, { status: 400 });

  const workspaceId = String(config.workspace_id);
  const conversationId = apiConversationId(workspaceId, suppliedId);
  if (!verifyWidgetThread(threadProof, token, workspaceId, suppliedId)) {
    return Response.json({ error: "Conversation access expired or is invalid" }, { status: 403 });
  }
  const state = await getConversationAutomationState(conversationId, workspaceId);
  if (!state) return Response.json({ error: "Conversation not found" }, { status: 404 });
  const rows = await listConversationMessages(conversationId, workspaceId, {
    afterSequence,
    limit: 100,
    customerVisibleOnly: true,
  });
  const cursor = rows.reduce((maximum, message) => Math.max(maximum, message.sequence), afterSequence);
  return Response.json({
    inboxStatus: state.inboxStatus,
    botMode: state.botMode,
    cursor,
    messages: rows
      .filter((message) => message.authorType === "bot" || message.authorType === "human")
      .map(publicMessage),
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  if (bodyTooLarge(req, 96_000)) {
    return Response.json({ error: "Request is too large." }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const token = String(body.token ?? "");
  const config = await getWidgetByToken(token);
  if (!config) return Response.json({ error: "Widget not found" }, { status: 404 });
  if (!validEmbed(config, token, String(body.embedProof ?? ""))) {
    return Response.json({ error: "Embedding domain is not approved" }, { status: 403 });
  }
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const identity = forwarded || req.headers.get("user-agent") || "anonymous";
  if (!(await consumeWidgetRateLimit(token, identity))) {
    return Response.json({ error: "Too many messages. Please wait a minute." }, { status: 429 });
  }

  const workspaceId = String(config.workspace_id);
  const suppliedId = safeConversationId(body.conversationId);
  const threadProof = String(body.threadToken ?? "");
  const clientMessageId = String(body.messageId ?? "");
  if (!suppliedId || !/^[a-zA-Z0-9_-]{8,100}$/.test(clientMessageId)) {
    return Response.json({ error: "Invalid conversation" }, { status: 400 });
  }
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .slice(-30)
    .filter((message: unknown): message is SimpleMessage => {
      const candidate = message as Partial<SimpleMessage> | null;
      return Boolean(candidate && (candidate.role === "user" || candidate.role === "assistant") &&
        typeof candidate.content === "string");
    });
  const last = [...messages].reverse().find((message) => message.role === "user")?.content.trim() ?? "";
  if (!last || last.length > 4_000) {
    return Response.json({ error: "Invalid message" }, { status: 400 });
  }

  const agent = await getAgentById(String(config.agent_id), workspaceId);
  if (!agent || agent.status !== "active") {
    return Response.json({ error: "Agent unavailable" }, { status: 503 });
  }
  const conversationId = apiConversationId(workspaceId, suppliedId);
  const existingState = await getConversationAutomationState(conversationId, workspaceId);
  if (existingState) {
    if (!verifyWidgetThread(threadProof, token, workspaceId, suppliedId)) {
      return Response.json({ error: "Conversation access expired or is invalid" }, { status: 403 });
    }
  } else if (threadProof) {
    return Response.json({ error: "Invalid conversation access" }, { status: 403 });
  }
  const issuedThreadToken = existingState
    ? threadProof
    : signWidgetThread(token, workspaceId, suppliedId);
  const existing = await getConversationById(conversationId, workspaceId);
  const startedAt = existing?.startedAt ?? new Date().toISOString();
  const contact = String(body.email || body.visitorId || "Website visitor").slice(0, 320);
  await ensureInboxConversation({
    id: conversationId,
    workspaceId,
    agentId: agent.id,
    channel: "chat",
    contact,
    startedAt,
  });
  const inbound = await appendConversationMessage({
    workspaceId,
    conversationId,
    authorType: "customer",
    body: last,
    channel: "chat",
    direction: "inbound",
    deliveryStatus: "delivered",
    idempotencyKey: `widget:${conversationId}:${clientMessageId}`,
  });
  let state = await getConversationAutomationState(conversationId, workspaceId);
  if (!state) return Response.json({ error: "Conversation unavailable" }, { status: 503 });
  if (!inbound.created) {
    return Response.json({
      conversationId: suppliedId,
      threadToken: issuedThreadToken,
      inboxStatus: state.inboxStatus,
      botMode: state.botMode,
    });
  }

  const rows = await listConversationMessages(conversationId, workspaceId, {
    limit: MAX_THREAD_TURNS,
    customerVisibleOnly: true,
  });
  const history = asModelHistory(rows);
  if (state.inboxStatus === "ai_active" && state.botMode === "active" &&
      hasConfirmedHumanHandoff(history)) {
    await requestHumanHandoff({
      workspaceId,
      conversationId,
      reason: "Website visitor explicitly requested a human team member.",
      priority: "high",
    });
    const reply = handoffAcknowledgement(last, "chat");
    const outgoing = await appendConversationMessage({
      workspaceId,
      conversationId,
      authorType: "bot",
      body: reply,
      channel: "chat",
      direction: "outbound",
      deliveryStatus: "delivered",
      idempotencyKey: `widget:${conversationId}:${clientMessageId}:handoff-ack`,
    });
    state = await getConversationAutomationState(conversationId, workspaceId) ?? state;
    await upsertConversation(buildConversation({
      id: conversationId,
      agentId: agent.id,
      channel: "chat",
      contact,
      startedAt,
      durationSec: 0,
      messages: [...history, { role: "assistant", content: reply }],
    }), workspaceId);
    return Response.json({
      reply,
      replyMessage: publicMessage(outgoing.message),
      conversationId: suppliedId,
      threadToken: issuedThreadToken,
      inboxStatus: state.inboxStatus,
      botMode: state.botMode,
    });
  }

  if (state.inboxStatus !== "ai_active" || state.botMode !== "active") {
    return Response.json({
      conversationId: suppliedId,
      threadToken: issuedThreadToken,
      inboxStatus: state.inboxStatus,
      botMode: state.botMode,
    });
  }

  const context = await retrieveContext(workspaceId, last);
  const reply = await generateReply(agent, history, context?.text, {
    workspaceId,
    agentId: agent.id,
    channel: "chat",
    conversationId,
    contactEmail: typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)
      ? body.email : undefined,
  });
  const outgoing = await appendBotMessageIfAutomationActive({
    workspaceId,
    conversationId,
    body: reply,
    channel: "chat",
    deliveryStatus: "delivered",
    idempotencyKey: `widget:${conversationId}:${clientMessageId}:bot-reply`,
    expectedStateVersion: state.stateVersion,
  });
  if (!outgoing.created || !outgoing.message) {
    state = await getConversationAutomationState(conversationId, workspaceId) ?? state;
    return Response.json({
      conversationId: suppliedId,
      threadToken: issuedThreadToken,
      inboxStatus: state.inboxStatus,
      botMode: state.botMode,
    });
  }
  await upsertConversation(buildConversation({
    id: conversationId,
    agentId: agent.id,
    channel: "chat",
    contact,
    startedAt,
    durationSec: 0,
    messages: [...history, { role: "assistant", content: reply }],
  }), workspaceId);
  if (body.email || body.name) {
    await syncCrmLead(workspaceId, {
      source: "website_widget",
      name: String(body.name || "").slice(0, 200),
      email: String(body.email || "").slice(0, 320),
      conversationId,
      latestMessage: last,
    });
  }
  return Response.json({
    reply,
    replyMessage: publicMessage(outgoing.message),
    conversationId: suppliedId,
    threadToken: issuedThreadToken,
    inboxStatus: state.inboxStatus,
    botMode: state.botMode,
  });
}

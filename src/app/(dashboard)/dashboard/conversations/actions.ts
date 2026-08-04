"use server";

import { revalidatePath } from "next/cache";
import { requireInboxOperator } from "@/lib/auth/session-cookies";
import {
  addAuditEvent,
  addConversationNote,
  appendConversationMessage,
  getAgentSendingNumber,
  getInboxConversation,
  getRoutingForNumber,
  listNotifications,
  listWorkspaceUsers,
  markConversationRead as markRead,
  markNotificationRead,
  updateConversationMessageDelivery,
  updateInboxConversationState,
} from "@/lib/repository";
import { sendTwilioMessage, twilioStatusCallbackUrl } from "@/lib/twilio-messaging";
import type {
  ConversationBotMode,
  ConversationPriority,
  InboxStatus,
} from "@/lib/types";

const INBOX_ROLES = new Set(["Owner", "Admin", "Agent"]);
const STATUSES = new Set<InboxStatus>(["ai_active", "needs_human", "human_active", "resolved"]);
const BOT_MODES = new Set<ConversationBotMode>(["active", "paused"]);
const PRIORITIES = new Set<ConversationPriority>(["low", "normal", "high", "urgent"]);

export type InboxActionState = { ok?: boolean; message?: string; error?: string };

function conversationId(formData: FormData) {
  const value = String(formData.get("conversationId") ?? "").trim();
  if (!/^[a-zA-Z0-9_:+-]{1,200}$/.test(value)) throw new Error("Invalid conversation.");
  return value;
}

function stateVersion(formData: FormData) {
  const raw = String(formData.get("stateVersion") ?? "").trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid conversation version.");
  return value;
}

function refreshInbox() {
  revalidatePath("/dashboard/conversations");
  revalidatePath("/dashboard", "layout");
}

export async function updateInboxState(formData: FormData) {
  const session = await requireInboxOperator();
  const id = conversationId(formData);
  const expectedStateVersion = stateVersion(formData);
  const intent = String(formData.get("intent") ?? "");

  let change: {
    inboxStatus?: InboxStatus;
    botMode?: ConversationBotMode;
    priority?: ConversationPriority;
  } = {};
  if (intent === "priority") {
    const priority = String(formData.get("priority") ?? "") as ConversationPriority;
    if (!PRIORITIES.has(priority)) throw new Error("Choose a valid priority.");
    change = { priority };
  } else if (intent === "botMode") {
    const botMode = String(formData.get("botMode") ?? "") as ConversationBotMode;
    if (!BOT_MODES.has(botMode)) throw new Error("Choose a valid AI mode.");
    const detail = await getInboxConversation(id, session.workspaceId, session.userId);
    if (!detail) throw new Error("Conversation not found.");
    if (detail.channel === "voice") {
      throw new Error("Live voice handoff is controlled by the caller's confirmed transfer request.");
    }
    // Resuming is explicit and returns ownership to the AI. Pausing moves the
    // live case to the team unless it has already been resolved.
    change = botMode === "active"
      ? { botMode: "active", inboxStatus: "ai_active" }
      : { botMode: "paused", inboxStatus: "needs_human" };
  } else if (intent === "status") {
    const inboxStatus = String(formData.get("inboxStatus") ?? "") as InboxStatus;
    if (!STATUSES.has(inboxStatus)) throw new Error("Choose a valid inbox status.");
    change = {
      inboxStatus,
      ...(inboxStatus === "ai_active"
        ? { botMode: "active" as const }
        : inboxStatus === "needs_human" || inboxStatus === "human_active"
          ? { botMode: "paused" as const }
          : {}),
    };
  } else {
    throw new Error("Invalid inbox action.");
  }

  const updated = await updateInboxConversationState({
    workspaceId: session.workspaceId,
    conversationId: id,
    expectedStateVersion,
    ...change,
  });
  if (!updated) throw new Error("This conversation changed in another window. Refresh and try again.");
  await addAuditEvent(session.workspaceId, session.email, "inbox.state_changed", {
    conversationId: id,
    intent,
    ...change,
  });
  refreshInbox();
}

export async function assignInboxConversation(formData: FormData) {
  const session = await requireInboxOperator();
  const id = conversationId(formData);
  const assignedUserId = String(formData.get("assignedUserId") ?? "").trim();
  const expectedStateVersion = stateVersion(formData);
  if (assignedUserId) {
    const team = await listWorkspaceUsers(session.workspaceId);
    const assignee = team.find((member) => member.id === assignedUserId);
    if (!assignee || !INBOX_ROLES.has(assignee.role) || assignee.status !== "active") {
      throw new Error("Choose an active inbox team member from this workspace.");
    }
  }
  const updated = await updateInboxConversationState({
    workspaceId: session.workspaceId,
    conversationId: id,
    assignedUserId: assignedUserId || null,
    expectedStateVersion,
  });
  if (!updated) throw new Error("This conversation changed in another window. Refresh and try again.");
  await addAuditEvent(session.workspaceId, session.email, "inbox.assigned", {
    conversationId: id,
    assignedUserId: assignedUserId || null,
  });
  refreshInbox();
}

async function addInboxNoteCore(formData: FormData) {
  const session = await requireInboxOperator();
  const id = conversationId(formData);
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 4_000) throw new Error("Note must be between 1 and 4,000 characters.");
  await addConversationNote({
    workspaceId: session.workspaceId,
    conversationId: id,
    authorUserId: session.userId,
    authorName: session.name || session.email,
    body,
  });
  await addAuditEvent(session.workspaceId, session.email, "inbox.note_added", {
    conversationId: id,
  });
  refreshInbox();
}

export async function addInboxNote(
  _previous: InboxActionState,
  formData: FormData
): Promise<InboxActionState> {
  try {
    await addInboxNoteCore(formData);
    return { ok: true, message: "Internal note added." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The note could not be added." };
  }
}

async function sendInboxReplyCore(formData: FormData) {
  const session = await requireInboxOperator();
  const id = conversationId(formData);
  const body = String(formData.get("body") ?? "").trim();
  const requestId = String(formData.get("idempotencyKey") ?? "").trim();
  if (!body || body.length > 4_000) throw new Error("Reply must be between 1 and 4,000 characters.");
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) throw new Error("Invalid reply request.");

  const detail = await getInboxConversation(id, session.workspaceId, session.userId);
  if (!detail) throw new Error("Conversation not found.");
  if (detail.inboxStatus === "resolved") throw new Error("Reopen this conversation before replying.");
  if (!(["chat", "sms", "whatsapp"] as const).includes(detail.channel as "chat" | "sms" | "whatsapp")) {
    throw new Error("This channel does not support inbox replies.");
  }

  const messageId = `msg_${crypto.randomUUID()}`;
  const twilioChannel = detail.channel === "whatsapp"
    ? "whatsapp" as const
    : detail.channel === "sms"
      ? "sms" as const
      : null;
  const appended = await appendConversationMessage({
    id: messageId,
    workspaceId: session.workspaceId,
    conversationId: id,
    authorType: "human",
    authorUserId: session.userId,
    authorName: session.name || session.email,
    body,
    channel: detail.channel,
    direction: "outbound",
    deliveryStatus: twilioChannel ? "pending" : "delivered",
    idempotencyKey: `inbox-reply:${session.workspaceId}:${requestId}`,
  });

  // A repeated Server Action request must never create a second billable
  // Twilio message. The existing delivery callback will finish the first one.
  if (!appended.created) {
    refreshInbox();
    if (appended.message.deliveryStatus === "failed") {
      throw new Error("That reply failed previously. Submit it again as a new message to retry.");
    }
    return "This reply was already submitted; no duplicate was sent.";
  }

  if (twilioChannel) {
    try {
      const from = detail.businessAddress || await getAgentSendingNumber(
        session.workspaceId,
        detail.agentId,
        twilioChannel
      );
      if (!from) throw new Error(`No ${twilioChannel === "whatsapp" ? "WhatsApp sender" : "SMS number"} is assigned to this bot.`);
      const route = await getRoutingForNumber(from, twilioChannel);
      if (!route || route.workspaceId !== session.workspaceId || route.agentId !== detail.agentId) {
        throw new Error("The original sender is no longer assigned to this bot.");
      }
      const sent = await sendTwilioMessage({
        channel: twilioChannel,
        to: detail.contact,
        from,
        body,
        statusCallback: twilioStatusCallbackUrl(appended.message.id),
      });
      await updateConversationMessageDelivery({
        messageId: appended.message.id,
        providerMessageSid: sent.sid,
        status: sent.status,
      });
    } catch (error) {
      await updateConversationMessageDelivery({
        messageId: appended.message.id,
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 500) : "Delivery failed",
      });
      await addAuditEvent(session.workspaceId, session.email, "inbox.reply_failed", {
        conversationId: id,
        channel: detail.channel,
      });
      refreshInbox();
      throw error;
    }
  }

  await addAuditEvent(session.workspaceId, session.email, "inbox.reply_sent", {
    conversationId: id,
    channel: detail.channel,
    messageId: appended.message.id,
  });
  refreshInbox();
  return "Reply sent.";
}

export async function sendInboxReply(
  _previous: InboxActionState,
  formData: FormData
): Promise<InboxActionState> {
  try {
    const message = await sendInboxReplyCore(formData);
    return { ok: true, message };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The reply could not be sent." };
  }
}

export async function markConversationRead(formData: FormData) {
  const session = await requireInboxOperator();
  const id = conversationId(formData);
  await markRead(id, session.workspaceId, session.userId);
  const notifications = await listNotifications(session.workspaceId, session.userId, 100);
  await Promise.all(
    notifications
      .filter((notification) => !notification.readAt && notification.conversationId === id)
      .map((notification) => markNotificationRead(notification.id, session.workspaceId, session.userId))
  );
  refreshInbox();
}

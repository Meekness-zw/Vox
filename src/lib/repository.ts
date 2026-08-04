import { sql, isDbEnabled } from "@/lib/db";
import {
  agents as mockAgents,
  appointments as mockAppointments,
  clientInvoices as mockClientInvoices,
  conversations as mockConversations,
  knowledgeSources as mockKnowledgeSources,
} from "@/lib/data";
import type {
  Agent,
  Appointment,
  ClientInvoice,
  Conversation,
  KnowledgeSource,
  BotRequest,
  BotRequestStatus,
  AdminBotRecord,
  BotBillingStatus,
  AdminClientRecord,
  CompanyProfile,
  SubscriptionStatus,
  BusinessDocument,
  DocumentTemplate,
  ConversationMessage,
  ConversationMessageAuthor,
  ConversationMessageDelivery,
  ConversationMessageDirection,
  ConversationNote,
  ConversationBotMode,
  ConversationPriority,
  InboxConversation,
  InboxNotification,
  InboxStatus,
} from "@/lib/types";

const demoBotRequests: BotRequest[] = [];
const demoBusinessDocuments: BusinessDocument[] = [];
const demoDocumentTemplates = new Map<string, DocumentTemplate>();
const demoInbox = new Map<string, InboxConversation>();
const demoInboxNotifications: InboxNotification[] = [];

function requireAdminDatabase() {
  if (!sql) {
    throw new Error(
      "The admin dashboard requires DATABASE_URL. Demo data is disabled for platform administration."
    );
  }
  return sql;
}

export type WorkspaceUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

/* ---- row mappers ---------------------------------------------------------- */

export async function listWorkspaceUsers(
  workspaceId = "ws_demo"
): Promise<WorkspaceUser[]> {
  if (!sql) {
    return [{ id: "u_demo", name: "Demo User", email: "demo@vox.ai", role: "Owner", status: "active" }];
  }
  const rows = await sql`
    select id, name, email, role, status
    from users
    where workspace_id = ${workspaceId} and status='active'
    order by created_at
  `;
  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    role: row.role as string,
    status: row.status as string,
  }));
}

function rowToAgent(r: Record<string, unknown>): Agent {
  return {
    id: r.id as string,
    name: r.name as string,
    type: r.type as Agent["type"],
    status: r.status as Agent["status"],
    language: r.language as string,
    voice: (r.voice as string) ?? undefined,
    personality: r.personality as string,
    systemPrompt: r.system_prompt as string,
    greeting: r.greeting as string,
    businessHours: r.business_hours as string,
    escalation: r.escalation as string,
    createdAt:
      r.created_at instanceof Date
        ? (r.created_at as Date).toISOString()
        : String(r.created_at),
  };
}

function rowToConversation(r: Record<string, unknown>): Conversation {
  return {
    id: r.id as string,
    agentId: r.agent_id as string,
    channel: r.channel as Conversation["channel"],
    contact: r.contact as string,
    startedAt:
      r.started_at instanceof Date
        ? (r.started_at as Date).toISOString()
        : String(r.started_at),
    durationSec: Number(r.duration_sec),
    sentiment: r.sentiment as Conversation["sentiment"],
    outcome: r.outcome as Conversation["outcome"],
    summary: r.summary as string,
    actionItems: (r.action_items as string[]) ?? [],
    transcript: (r.transcript as Conversation["transcript"]) ?? [],
  };
}

/* ---- reads (DB-backed with mock fallback) -------------------------------- */

export async function listAgents(workspaceId = "ws_demo"): Promise<Agent[]> {
  if (!sql) return mockAgents;
  const rows = await sql`
    select * from agents where workspace_id = ${workspaceId} order by created_at asc
  `;
  return rows.map(rowToAgent);
}

export async function getAgentById(
  id: string,
  workspaceId = "ws_demo"
): Promise<Agent | undefined> {
  if (!sql) return mockAgents.find((a) => a.id === id);
  const rows = await sql`
    select * from agents where id = ${id} and workspace_id = ${workspaceId} limit 1
  `;
  return rows.length ? rowToAgent(rows[0]) : undefined;
}

export async function listConversations(
  workspaceId = "ws_demo"
): Promise<Conversation[]> {
  if (!sql) return mockConversations;
  const rows = await sql`
    select * from conversations where workspace_id = ${workspaceId}
    order by started_at desc
  `;
  return rows.map(rowToConversation);
}

export async function getConversationById(
  id: string,
  workspaceId = "ws_demo"
): Promise<Conversation | undefined> {
  if (!sql) return mockConversations.find((c) => c.id === id);
  const rows = await sql`
    select * from conversations where id = ${id} and workspace_id = ${workspaceId} limit 1
  `;
  return rows.length ? rowToConversation(rows[0]) : undefined;
}

/* ---- phone number routing (multi-tenant voice + WhatsApp) ----------------- */

export type NumberRoute = { workspaceId: string; agentId: string };

function normalizePhoneNumber(number: string) {
  const trimmed = number.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/**
 * Resolve which workspace + agent should answer a call/message to `number` on
 * `channel`. In demo mode (no DB), every number routes to the demo workspace's
 * first matching agent, so voice/WhatsApp/chat all work with zero config.
 */
export async function getRoutingForNumber(
  number: string,
  channel: "voice" | "whatsapp" | "sms"
): Promise<NumberRoute | null> {
  if (!sql) {
    const agentType = channel === "voice" ? "voice" : "chat";
    const agent =
      mockAgents.find((a) => a.type === agentType && a.status === "active") ??
      mockAgents[0];
    return agent ? { workspaceId: "ws_demo", agentId: agent.id } : null;
  }
  const normalized = normalizePhoneNumber(number);
  const routingChannel = channel === "sms" ? "voice" : channel;
  const rows = await sql`
    select p.workspace_id, p.agent_id from phone_numbers p
    join agents a on a.id=p.agent_id and a.workspace_id=p.workspace_id and a.status='active'
    where regexp_replace(p.number, '[^0-9+]', '', 'g') = ${normalized}
      and p.channel = ${routingChannel} limit 1
  `;
  return rows.length
    ? { workspaceId: rows[0].workspace_id as string, agentId: rows[0].agent_id as string }
    : null;
}

export async function upsertPhoneNumber(entry: {
  id: string;
  number: string;
  channel: "voice" | "whatsapp";
  agentId: string;
}, workspaceId = "ws_demo"): Promise<void> {
  if (!sql) return;
  const normalized = normalizePhoneNumber(entry.number);
  const rows = await sql`
    insert into phone_numbers (id, workspace_id, number, channel, agent_id)
    values (${entry.id}, ${workspaceId}, ${normalized}, ${entry.channel}, ${entry.agentId})
    on conflict (number, channel) do update set
      agent_id = excluded.agent_id, workspace_id = excluded.workspace_id
    where phone_numbers.workspace_id = excluded.workspace_id
    returning id
  `;
  if (!rows.length) {
    throw new Error("That phone number is already assigned to another Vox workspace.");
  }
}

export async function getWorkspaceSendingNumber(
  workspaceId: string,
  preferredChannel: "voice" | "whatsapp" | "sms" = "voice"
): Promise<string | null> {
  if (!sql) {
    const configured = preferredChannel === "whatsapp"
      ? process.env.TWILIO_WHATSAPP_NUMBER
      : process.env.TWILIO_PHONE_NUMBER;
    return configured?.trim() || null;
  }
  const routingChannel = preferredChannel === "sms" ? "voice" : preferredChannel;
  const rows = await sql`
    select number from phone_numbers
    where workspace_id = ${workspaceId} and channel = ${routingChannel}
    order by created_at asc limit 1
  `;
  return rows.length ? String(rows[0].number) : null;
}

/** Prefer the exact bot's sender when a workspace owns more than one bot. */
export async function getAgentSendingNumber(
  workspaceId: string,
  agentId: string,
  preferredChannel: "voice" | "whatsapp" | "sms"
): Promise<string | null> {
  if (!sql) return getWorkspaceSendingNumber(workspaceId, preferredChannel);
  const routingChannel = preferredChannel === "sms" ? "voice" : preferredChannel;
  const rows = await sql`
    select number from phone_numbers
    where workspace_id=${workspaceId} and agent_id=${agentId} and channel=${routingChannel}
    order by created_at asc limit 1
  `;
  return rows.length ? String(rows[0].number) : null;
}

/* ---- calendar connections --------------------------------------------------- */

export type CalendarConnection = {
  workspaceId: string;
  provider: string;
  calendarId: string;
  refreshTokenEncrypted: string;
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
  timezone: string;
};

export async function getCalendarConnection(
  workspaceId = "ws_demo"
): Promise<CalendarConnection | null> {
  if (!sql) return null;
  const rows = await sql`
    select * from calendar_connections where workspace_id = ${workspaceId} limit 1
  `;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    workspaceId: r.workspace_id as string,
    provider: r.provider as string,
    calendarId: r.calendar_id as string,
    refreshTokenEncrypted: r.refresh_token as string,
    accessToken: (r.access_token as string) ?? null,
    accessTokenExpiresAt: r.access_token_expires_at
      ? new Date(r.access_token_expires_at as string).toISOString()
      : null,
    timezone: r.timezone as string,
  };
}

export async function upsertCalendarConnection(opts: {
  workspaceId: string;
  calendarId: string;
  refreshTokenEncrypted: string;
  accessToken?: string;
  accessTokenExpiresAt?: string;
  timezone?: string;
}): Promise<void> {
  if (!sql) return;
  await sql`
    insert into calendar_connections
      (workspace_id, calendar_id, refresh_token, access_token, access_token_expires_at, timezone)
    values (${opts.workspaceId}, ${opts.calendarId}, ${opts.refreshTokenEncrypted},
      ${opts.accessToken ?? null}, ${opts.accessTokenExpiresAt ?? null},
      ${opts.timezone ?? process.env.VOX_DEFAULT_TIMEZONE?.trim() ?? "Africa/Harare"})
    on conflict (workspace_id) do update set
      calendar_id = excluded.calendar_id, refresh_token = excluded.refresh_token,
      access_token = excluded.access_token,
      access_token_expires_at = excluded.access_token_expires_at,
      timezone = excluded.timezone
  `;
}

/* ---- appointments ----------------------------------------------------------- */

function rowToAppointment(r: Record<string, unknown>): Appointment {
  return {
    id: r.id as string,
    agentId: r.agent_id as string,
    conversationId: (r.conversation_id as string) ?? undefined,
    contactName: r.contact_name as string,
    contactPhone: (r.contact_phone as string) ?? undefined,
    contactEmail: (r.contact_email as string) ?? undefined,
    service: r.service as string,
    startsAt:
      r.starts_at instanceof Date ? (r.starts_at as Date).toISOString() : String(r.starts_at),
    endsAt: r.ends_at instanceof Date ? (r.ends_at as Date).toISOString() : String(r.ends_at),
    status: r.status as Appointment["status"],
    googleEventId: (r.google_event_id as string) ?? undefined,
    createdAt:
      r.created_at instanceof Date ? (r.created_at as Date).toISOString() : String(r.created_at),
  };
}

export async function listAppointments(workspaceId = "ws_demo"): Promise<Appointment[]> {
  if (!sql) return mockAppointments;
  const rows = await sql`
    select * from appointments where workspace_id = ${workspaceId} order by starts_at desc
  `;
  return rows.map(rowToAppointment);
}

/** Appointments overlapping [rangeStart, rangeEnd) — used to compute availability. */
export async function listAppointmentsInRange(
  workspaceId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<Appointment[]> {
  if (!sql) {
    return mockAppointments.filter(
      (a) => a.startsAt < rangeEnd && a.endsAt > rangeStart && a.status === "confirmed"
    );
  }
  const rows = await sql`
    select * from appointments
    where workspace_id = ${workspaceId} and status = 'confirmed'
      and starts_at < ${rangeEnd} and ends_at > ${rangeStart}
  `;
  return rows.map(rowToAppointment);
}

export async function getAppointmentById(
  id: string,
  workspaceId = "ws_demo"
): Promise<Appointment | undefined> {
  if (!sql) return mockAppointments.find((a) => a.id === id);
  const rows = await sql`
    select * from appointments where id = ${id} and workspace_id = ${workspaceId} limit 1
  `;
  return rows.length ? rowToAppointment(rows[0]) : undefined;
}

export async function insertAppointment(
  a: Appointment,
  workspaceId = "ws_demo"
): Promise<void> {
  if (!sql) return; // demo mode: caller keeps the object in memory for the response
  await sql`
    insert into appointments (id, workspace_id, agent_id, conversation_id, contact_name,
      contact_phone, contact_email, service, starts_at, ends_at, status, google_event_id, created_at)
    values (${a.id}, ${workspaceId}, ${a.agentId}, ${a.conversationId ?? null}, ${a.contactName},
      ${a.contactPhone ?? null}, ${a.contactEmail ?? null}, ${a.service}, ${a.startsAt}, ${a.endsAt},
      ${a.status}, ${a.googleEventId ?? null}, ${a.createdAt})
  `;
}

/** Atomically reserve a slot within a workspace to prevent double bookings. */
export async function insertAppointmentIfAvailable(
  a: Appointment,
  workspaceId: string
): Promise<void> {
  if (!sql) return;
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${workspaceId}))`;
    const overlap = await tx`
      select 1 from appointments
      where workspace_id = ${workspaceId} and status = 'confirmed'
        and starts_at < ${a.endsAt} and ends_at > ${a.startsAt}
      limit 1
    `;
    if (overlap.length) throw new Error("That time is no longer available");
    await tx`
      insert into appointments (id, workspace_id, agent_id, conversation_id, contact_name,
        contact_phone, contact_email, service, starts_at, ends_at, status, google_event_id, created_at)
      values (${a.id}, ${workspaceId}, ${a.agentId}, ${a.conversationId ?? null}, ${a.contactName},
        ${a.contactPhone ?? null}, ${a.contactEmail ?? null}, ${a.service}, ${a.startsAt}, ${a.endsAt},
        ${a.status}, ${a.googleEventId ?? null}, ${a.createdAt})
    `;
  });
}

export async function cancelAppointmentRow(
  id: string,
  workspaceId = "ws_demo"
): Promise<void> {
  if (!sql) return;
  await sql`
    update appointments set status = 'cancelled'
    where id = ${id} and workspace_id = ${workspaceId}
  `;
}

/* ---- client invoices --------------------------------------------------------- */

function rowToClientInvoice(r: Record<string, unknown>): ClientInvoice {
  return {
    id: r.id as string,
    agentId: (r.agent_id as string) ?? undefined,
    conversationId: (r.conversation_id as string) ?? undefined,
    contactName: r.contact_name as string,
    contactEmail: r.contact_email as string,
    lineItems: (r.line_items as ClientInvoice["lineItems"]) ?? [],
    subtotalCents: Number(r.subtotal_cents),
    totalCents: Number(r.total_cents),
    status: r.status as ClientInvoice["status"],
    notes: (r.notes as string) ?? undefined,
    createdAt:
      r.created_at instanceof Date ? (r.created_at as Date).toISOString() : String(r.created_at),
    sentAt: r.sent_at
      ? r.sent_at instanceof Date
        ? (r.sent_at as Date).toISOString()
        : String(r.sent_at)
      : undefined,
  };
}

export async function listClientInvoices(workspaceId = "ws_demo"): Promise<ClientInvoice[]> {
  if (!sql) return mockClientInvoices;
  const rows = await sql`
    select * from client_invoices where workspace_id = ${workspaceId} order by created_at desc
  `;
  return rows.map(rowToClientInvoice);
}

export async function getClientInvoiceById(
  id: string,
  workspaceId = "ws_demo"
): Promise<ClientInvoice | undefined> {
  if (!sql) return mockClientInvoices.find((i) => i.id === id);
  const rows = await sql`
    select * from client_invoices where id = ${id} and workspace_id = ${workspaceId} limit 1
  `;
  return rows.length ? rowToClientInvoice(rows[0]) : undefined;
}

export async function insertClientInvoice(
  inv: ClientInvoice,
  workspaceId = "ws_demo"
): Promise<void> {
  if (!sql) return; // demo mode: caller keeps the object in memory for the response
  await sql`
    insert into client_invoices (id, workspace_id, agent_id, conversation_id, contact_name,
      contact_email, line_items, subtotal_cents, total_cents, status, notes, created_at, sent_at)
    values (${inv.id}, ${workspaceId}, ${inv.agentId ?? null}, ${inv.conversationId ?? null},
      ${inv.contactName}, ${inv.contactEmail}, ${sql.json(inv.lineItems)}, ${inv.subtotalCents},
      ${inv.totalCents}, ${inv.status}, ${inv.notes ?? null}, ${inv.createdAt}, ${inv.sentAt ?? null})
  `;
}

/* ---- business documents and branding ------------------------------------- */

const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : String(value);

function rowToBusinessDocument(r: Record<string, unknown>): BusinessDocument {
  return {
    id: r.id as string,
    agentId: (r.agent_id as string) ?? undefined,
    conversationId: (r.conversation_id as string) ?? undefined,
    type: r.type as BusinessDocument["type"],
    number: r.number as string,
    status: r.status as BusinessDocument["status"],
    contactName: r.contact_name as string,
    contactEmail: (r.contact_email as string) ?? undefined,
    contactPhone: (r.contact_phone as string) ?? undefined,
    contactAddress: (r.contact_address as string) ?? undefined,
    lineItems: (r.line_items as BusinessDocument["lineItems"]) ?? [],
    subtotalCents: Number(r.subtotal_cents),
    taxCents: Number(r.tax_cents),
    totalCents: Number(r.total_cents),
    currency: r.currency as string,
    notes: (r.notes as string) ?? undefined,
    metadata: (r.metadata as Record<string, string>) ?? {},
    issueDate: String(r.issue_date).slice(0, 10),
    dueDate: r.due_date ? String(r.due_date).slice(0, 10) : undefined,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export async function listBusinessDocuments(
  workspaceId = "ws_demo"
): Promise<BusinessDocument[]> {
  if (!sql) return demoBusinessDocuments;
  const rows = await sql`
    select * from business_documents
    where workspace_id = ${workspaceId}
    order by created_at desc
  `;
  return rows.map(rowToBusinessDocument);
}

export async function getBusinessDocumentById(
  id: string,
  workspaceId = "ws_demo"
): Promise<BusinessDocument | undefined> {
  if (!sql) return demoBusinessDocuments.find((item) => item.id === id);
  const rows = await sql`
    select * from business_documents
    where id = ${id} and workspace_id = ${workspaceId}
    limit 1
  `;
  return rows.length ? rowToBusinessDocument(rows[0]) : undefined;
}

export async function insertBusinessDocument(
  document: BusinessDocument,
  workspaceId = "ws_demo"
): Promise<void> {
  if (!sql) {
    demoBusinessDocuments.unshift(document);
    return;
  }
  await sql`
    insert into business_documents (
      id, workspace_id, agent_id, conversation_id, type, number, status,
      contact_name, contact_email, contact_phone, contact_address, line_items,
      subtotal_cents, tax_cents, total_cents, currency, notes, metadata,
      issue_date, due_date, created_at, updated_at
    ) values (
      ${document.id}, ${workspaceId}, ${document.agentId ?? null},
      ${document.conversationId ?? null}, ${document.type}, ${document.number},
      ${document.status}, ${document.contactName}, ${document.contactEmail ?? null},
      ${document.contactPhone ?? null}, ${document.contactAddress ?? null},
      ${sql.json(document.lineItems)}, ${document.subtotalCents}, ${document.taxCents},
      ${document.totalCents}, ${document.currency}, ${document.notes ?? null},
      ${sql.json(document.metadata)}, ${document.issueDate}, ${document.dueDate ?? null},
      ${document.createdAt}, ${document.updatedAt}
    )
  `;
}

function rowToDocumentTemplate(r: Record<string, unknown>): DocumentTemplate {
  return {
    businessName: r.business_name as string,
    logoUrl: (r.logo_url as string) ?? undefined,
    primaryColor: r.primary_color as string,
    accentColor: r.accent_color as string,
    currency: r.currency as string,
    address: r.address as string,
    phone: r.phone as string,
    email: r.email as string,
    taxNumber: r.tax_number as string,
    footer: r.footer as string,
    paymentTerms: r.payment_terms as string,
    updatedAt: iso(r.updated_at),
  };
}

export async function getDocumentTemplate(
  workspaceId = "ws_demo"
): Promise<DocumentTemplate | undefined> {
  if (!sql) return demoDocumentTemplates.get(workspaceId);
  const rows = await sql`
    select * from document_templates where workspace_id = ${workspaceId} limit 1
  `;
  return rows.length ? rowToDocumentTemplate(rows[0]) : undefined;
}

export async function upsertDocumentTemplate(
  template: DocumentTemplate,
  workspaceId = "ws_demo"
): Promise<void> {
  if (!sql) {
    demoDocumentTemplates.set(workspaceId, template);
    return;
  }
  await sql`
    insert into document_templates (
      workspace_id, business_name, logo_url, primary_color, accent_color,
      currency, address, phone, email, tax_number, footer, payment_terms, updated_at
    ) values (
      ${workspaceId}, ${template.businessName}, ${template.logoUrl ?? null},
      ${template.primaryColor}, ${template.accentColor}, ${template.currency},
      ${template.address}, ${template.phone}, ${template.email}, ${template.taxNumber},
      ${template.footer}, ${template.paymentTerms}, ${template.updatedAt}
    )
    on conflict (workspace_id) do update set
      business_name = excluded.business_name, logo_url = excluded.logo_url,
      primary_color = excluded.primary_color, accent_color = excluded.accent_color,
      currency = excluded.currency, address = excluded.address, phone = excluded.phone,
      email = excluded.email, tax_number = excluded.tax_number, footer = excluded.footer,
      payment_terms = excluded.payment_terms, updated_at = excluded.updated_at
  `;
}

/* ---- writes --------------------------------------------------------------- */

export async function upsertAgent(
  a: Agent,
  workspaceId = "ws_demo"
): Promise<void> {
  if (!sql) {
    const index = mockAgents.findIndex((agent) => agent.id === a.id);
    if (index >= 0) mockAgents[index] = a;
    else mockAgents.push(a);
    return;
  }
  await sql`
    insert into agents (id, workspace_id, name, type, status, language, voice,
      personality, system_prompt, greeting, business_hours, escalation, created_at)
    values (${a.id}, ${workspaceId}, ${a.name}, ${a.type}, ${a.status},
      ${a.language}, ${a.voice ?? null}, ${a.personality}, ${a.systemPrompt},
      ${a.greeting}, ${a.businessHours}, ${a.escalation}, ${a.createdAt})
    on conflict (id) do update set
      name = excluded.name, type = excluded.type, status = excluded.status,
      language = excluded.language, voice = excluded.voice,
      personality = excluded.personality, system_prompt = excluded.system_prompt,
      greeting = excluded.greeting, business_hours = excluded.business_hours,
      escalation = excluded.escalation
    where agents.workspace_id = excluded.workspace_id
  `;
}

export async function insertConversation(
  c: Conversation,
  workspaceId = "ws_demo"
): Promise<void> {
  if (!sql) return;
  await sql`
    insert into conversations (id, workspace_id, agent_id, channel, contact,
      started_at, duration_sec, sentiment, outcome, summary, action_items, transcript)
    values (${c.id}, ${workspaceId}, ${c.agentId}, ${c.channel}, ${c.contact},
      ${c.startedAt}, ${c.durationSec}, ${c.sentiment}, ${c.outcome}, ${c.summary},
      ${sql.json(c.actionItems)}, ${sql.json(c.transcript)})
    on conflict (id) do nothing
  `;
}

/** Insert or update a conversation (used for live chat/voice capture). */
export async function upsertConversation(
  c: Conversation,
  workspaceId = "ws_demo"
): Promise<void> {
  if (!sql) return;
  await sql`
    insert into conversations (id, workspace_id, agent_id, channel, contact,
      started_at, duration_sec, sentiment, outcome, summary, action_items, transcript)
    values (${c.id}, ${workspaceId}, ${c.agentId}, ${c.channel}, ${c.contact},
      ${c.startedAt}, ${c.durationSec}, ${c.sentiment}, ${c.outcome}, ${c.summary},
      ${sql.json(c.actionItems)}, ${sql.json(c.transcript)})
    on conflict (id) do update set
      duration_sec = excluded.duration_sec, sentiment = excluded.sentiment,
      outcome = excluded.outcome, summary = excluded.summary,
      action_items = excluded.action_items, transcript = excluded.transcript
    where conversations.workspace_id = excluded.workspace_id
      and conversations.agent_id = excluded.agent_id
  `;
}

/* ---- managed bot requests ------------------------------------------------ */

function rowToBotRequest(r: Record<string, unknown>): BotRequest {
  const date = (value: unknown) =>
    value instanceof Date ? value.toISOString() : String(value);
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    businessName: r.business_name as string,
    industry: r.industry as string,
    description: r.description as string,
    services: r.services as string,
    businessHours: r.business_hours as string,
    languages: r.languages as string,
    tone: r.tone as string,
    escalation: r.escalation as string,
    companyPhone: (r.company_phone as string) || undefined,
    routingPhone: (r.routing_phone as string) || undefined,
    transferPhone: (r.transfer_phone as string) || undefined,
    whatsappPhone: (r.whatsapp_phone as string) || undefined,
    whatsappSenderSid: (r.whatsapp_sender_sid as string) || undefined,
    whatsappSenderStatus: (r.whatsapp_sender_status as string) || undefined,
    timezone: (r.timezone as string) || "Africa/Harare",
    businessSchedule: (r.business_schedule as BotRequest["businessSchedule"]) ?? [],
    channels: (r.channels as string[]) ?? [],
    contactName: r.contact_name as string,
    contactEmail: r.contact_email as string,
    status: r.status as BotRequestStatus,
    adminNotes: (r.admin_notes as string) ?? "",
    agentId: (r.agent_id as string) ?? undefined,
    createdAt: date(r.created_at),
    updatedAt: date(r.updated_at),
  };
}

export async function createBotRequest(request: BotRequest): Promise<void> {
  if (!sql) {
    demoBotRequests.unshift(request);
    return;
  }
  await sql`
    insert into bot_requests (id, workspace_id, business_name, industry, description,
      services, business_hours, languages, tone, escalation, channels, contact_name,
      contact_email, status, admin_notes, agent_id, created_at, updated_at,
      company_phone, routing_phone, transfer_phone, whatsapp_phone, timezone, business_schedule)
    values (${request.id}, ${request.workspaceId}, ${request.businessName}, ${request.industry},
      ${request.description}, ${request.services}, ${request.businessHours}, ${request.languages},
      ${request.tone}, ${request.escalation}, ${sql.json(request.channels)}, ${request.contactName},
      ${request.contactEmail}, ${request.status}, ${request.adminNotes}, ${request.agentId ?? null},
      ${request.createdAt}, ${request.updatedAt}, ${request.companyPhone ?? null},
      ${request.routingPhone ?? null}, ${request.transferPhone ?? null},
      ${request.whatsappPhone ?? null}, ${request.timezone ?? "Africa/Harare"},
      ${sql.json(request.businessSchedule ?? [])})
  `;
}

/** Save a client's request and canonical company profile as one unit. */
export async function createBotRequestWithCompanyProfile(
  request: BotRequest,
  profile: CompanyProfile
): Promise<void> {
  if (request.workspaceId !== profile.workspaceId) {
    throw new Error("Bot request and company profile must belong to the same workspace.");
  }
  if (!sql) {
    demoBotRequests.unshift(request);
    return;
  }
  await sql.begin(async (tx) => {
    await tx`
      insert into bot_requests (id, workspace_id, business_name, industry, description,
        services, business_hours, languages, tone, escalation, channels, contact_name,
        contact_email, status, admin_notes, agent_id, created_at, updated_at,
        company_phone, routing_phone, transfer_phone, whatsapp_phone, timezone, business_schedule)
      values (${request.id}, ${request.workspaceId}, ${request.businessName}, ${request.industry},
        ${request.description}, ${request.services}, ${request.businessHours}, ${request.languages},
        ${request.tone}, ${request.escalation}, ${tx.json(request.channels)}, ${request.contactName},
        ${request.contactEmail}, ${request.status}, ${request.adminNotes}, ${request.agentId ?? null},
        ${request.createdAt}, ${request.updatedAt}, ${request.companyPhone ?? null},
        ${request.routingPhone ?? null}, ${request.transferPhone ?? null},
        ${request.whatsappPhone ?? null}, ${request.timezone ?? "Africa/Harare"},
        ${tx.json(request.businessSchedule ?? [])})
    `;
    await tx`
      insert into company_profiles (workspace_id, business_name, industry, description, services,
        business_hours, languages, tone, escalation, updated_at, company_phone,
        routing_phone, transfer_phone, whatsapp_phone, timezone, business_schedule)
      values (${profile.workspaceId}, ${profile.businessName}, ${profile.industry}, ${profile.description},
        ${profile.services}, ${profile.businessHours}, ${profile.languages}, ${profile.tone},
        ${profile.escalation}, ${profile.updatedAt}, ${profile.companyPhone ?? null},
        ${profile.routingPhone ?? null}, ${profile.transferPhone ?? null},
        ${profile.whatsappPhone ?? null}, ${profile.timezone ?? "Africa/Harare"},
        ${tx.json(profile.businessSchedule ?? [])})
      on conflict (workspace_id) do update set business_name=excluded.business_name,
        industry=excluded.industry, description=excluded.description, services=excluded.services,
        business_hours=excluded.business_hours, languages=excluded.languages, tone=excluded.tone,
        escalation=excluded.escalation, company_phone=excluded.company_phone,
        routing_phone=excluded.routing_phone, transfer_phone=excluded.transfer_phone,
        whatsapp_phone=excluded.whatsapp_phone, timezone=excluded.timezone,
        business_schedule=excluded.business_schedule, updated_at=excluded.updated_at
    `;
  });
}

export async function listBotRequests(workspaceId?: string): Promise<BotRequest[]> {
  if (!sql) return workspaceId ? demoBotRequests.filter((r) => r.workspaceId === workspaceId) : demoBotRequests;
  const rows = workspaceId
    ? await sql`select * from bot_requests where workspace_id = ${workspaceId} order by created_at desc`
    : await sql`select * from bot_requests order by created_at desc`;
  return rows.map(rowToBotRequest);
}

export async function listAdminBotRequests(): Promise<BotRequest[]> {
  const db = requireAdminDatabase();
  const rows = await db`select * from bot_requests order by created_at desc`;
  return rows.map(rowToBotRequest);
}

export async function getBotRequest(id: string, workspaceId?: string): Promise<BotRequest | undefined> {
  if (!sql) return demoBotRequests.find((r) => r.id === id && (!workspaceId || r.workspaceId === workspaceId));
  const rows = workspaceId
    ? await sql`select * from bot_requests where id = ${id} and workspace_id = ${workspaceId} limit 1`
    : await sql`select * from bot_requests where id = ${id} limit 1`;
  return rows.length ? rowToBotRequest(rows[0]) : undefined;
}

export async function getAdminBotRequest(id: string): Promise<BotRequest | undefined> {
  const db = requireAdminDatabase();
  const rows = await db`select * from bot_requests where id = ${id} limit 1`;
  return rows.length ? rowToBotRequest(rows[0]) : undefined;
}

export async function updateBotRequest(input: {
  id: string;
  workspaceId?: string;
  status: BotRequestStatus;
  adminNotes?: string;
  agentId?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  if (!sql) {
    const request = demoBotRequests.find((r) => r.id === input.id);
    if (request) Object.assign(request, { status: input.status, adminNotes: input.adminNotes ?? request.adminNotes, agentId: input.agentId ?? request.agentId, updatedAt: now });
    return;
  }
  await sql`
    update bot_requests set status = ${input.status},
      admin_notes = coalesce(${input.adminNotes ?? null}, admin_notes),
      agent_id = coalesce(${input.agentId ?? null}, agent_id),
      updated_at = ${now} where id = ${input.id}
      and (${input.workspaceId ?? null}::text is null or workspace_id = ${input.workspaceId ?? null})
  `;
}

export async function updateWhatsAppOnboarding(input: {
  id: string;
  senderSid?: string;
  senderStatus: string;
}): Promise<void> {
  const db = requireAdminDatabase();
  await db`
    update bot_requests set
      whatsapp_sender_sid = coalesce(${input.senderSid ?? null}, whatsapp_sender_sid),
      whatsapp_sender_status = ${input.senderStatus}, updated_at = now()
    where id = ${input.id}
  `;
}

export async function updateBotRequestNumber(input: {
  id: string;
  channel: "voice" | "whatsapp";
  number: string;
}): Promise<void> {
  const db = requireAdminDatabase();
  if (input.channel === "voice") {
    await db`update bot_requests set routing_phone=${input.number}, updated_at=now() where id=${input.id}`;
  } else {
    await db`update bot_requests set whatsapp_phone=${input.number}, updated_at=now() where id=${input.id}`;
  }
}

export async function updateManagedBusinessSchedule(input: {
  requestId: string;
  workspaceId: string;
  businessHours: string;
  timezone: string;
  businessSchedule: NonNullable<BotRequest["businessSchedule"]>;
}): Promise<void> {
  const db = requireAdminDatabase();
  await db.begin(async (transaction) => {
    await transaction`
      update bot_requests set business_hours=${input.businessHours},
        timezone=${input.timezone}, business_schedule=${transaction.json(input.businessSchedule)},
        updated_at=now() where id=${input.requestId} and workspace_id=${input.workspaceId}
    `;
    await transaction`
      update company_profiles set business_hours=${input.businessHours},
        timezone=${input.timezone}, business_schedule=${transaction.json(input.businessSchedule)},
        updated_at=now() where workspace_id=${input.workspaceId}
    `;
    await transaction`
      update agents set business_hours=${input.businessHours}
      where workspace_id=${input.workspaceId} and id=(
        select agent_id from bot_requests where id=${input.requestId}
      )
    `;
  });
}

/* ---- platform admin: bot fleet & billing -------------------------------- */

export async function listAdminBots(): Promise<AdminBotRecord[]> {
  const db = requireAdminDatabase();
  const rows = await db`
    select a.id, a.workspace_id, w.name workspace_name, a.name, a.type, a.status,
      a.billing_status, a.price_cents, a.paid_through, a.created_at,
      coalesce((select min(u.email) from users u where u.workspace_id = a.workspace_id), '') client_email,
      (select count(*)::int from conversations c where c.agent_id = a.id and c.workspace_id = a.workspace_id) conversations,
      (select count(*)::int from appointments ap where ap.agent_id = a.id and ap.workspace_id = a.workspace_id) appointments
    from agents a join workspaces w on w.id = a.workspace_id
    order by a.created_at desc
  `;
  return rows.map((r) => ({
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    workspaceName: r.workspace_name as string,
    clientEmail: r.client_email as string,
    name: r.name as string,
    type: r.type as AdminBotRecord["type"],
    status: r.status as AdminBotRecord["status"],
    billingStatus: r.billing_status as BotBillingStatus,
    priceCents: Number(r.price_cents),
    paidThrough: r.paid_through ? new Date(r.paid_through as string).toISOString() : undefined,
    conversations: Number(r.conversations),
    appointments: Number(r.appointments),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

export async function updateAgentBilling(input: {
  agentId: string;
  billingStatus: BotBillingStatus;
  priceCents: number;
  paidThrough?: string;
}): Promise<void> {
  const db = requireAdminDatabase();
  await db`
    update agents set billing_status = ${input.billingStatus},
      price_cents = ${input.priceCents}, paid_through = ${input.paidThrough ?? null}
    where id = ${input.agentId}
  `;
}

export async function updateAdminAgentState(input: {
  agentId: string;
  status: Agent["status"];
  billingStatus: BotBillingStatus;
  priceCents: number;
  paidThrough?: string;
}): Promise<void> {
  const db = requireAdminDatabase();
  await db`
    update agents set status = ${input.status}, billing_status = ${input.billingStatus},
      price_cents = ${input.priceCents}, paid_through = ${input.paidThrough || null}
    where id = ${input.agentId}
  `;
}

/* ---- subscriptions, clients & company profiles -------------------------- */

export async function getWorkspaceSubscription(workspaceId: string): Promise<{
  plan: string;
  status: SubscriptionStatus;
  dueAt?: string;
  stripeCustomerId?: string;
}> {
  if (!sql) return { plan: workspaceId === "ws_demo" ? "growth" : "free", status: workspaceId === "ws_demo" ? "active" : "free" };
  const rows = await sql`select plan, subscription_status, subscription_due_at, stripe_customer_id from workspaces where id = ${workspaceId} limit 1`;
  if (!rows.length) return { plan: "free", status: "free" };
  return {
    plan: rows[0].plan as string,
    status: rows[0].subscription_status as SubscriptionStatus,
    dueAt: rows[0].subscription_due_at ? new Date(rows[0].subscription_due_at as string).toISOString() : undefined,
    stripeCustomerId: (rows[0].stripe_customer_id as string) || undefined,
  };
}

export async function getWorkspaceUsage(workspaceId: string, since: string) {
  if (!sql) return { voiceMinutes: 0, chatConversations: 0, agents: mockAgents.length };
  const [row] = await sql`
    select
      coalesce((select ceil(sum(duration_sec) / 60.0)::int from conversations
        where workspace_id=${workspaceId} and channel='voice' and started_at >= ${since}), 0) voice_minutes,
      coalesce((select count(*)::int from conversations
        where workspace_id=${workspaceId} and channel in ('chat','whatsapp','sms') and started_at >= ${since}), 0) chat_conversations,
      coalesce((select count(*)::int from agents where workspace_id=${workspaceId}), 0) agents
  `;
  return {
    voiceMinutes: Number(row.voice_minutes),
    chatConversations: Number(row.chat_conversations),
    agents: Number(row.agents),
  };
}

export async function updateWorkspaceSubscription(input: {
  workspaceId: string;
  plan: string;
  status: SubscriptionStatus;
  dueAt?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}): Promise<void> {
  const db = requireAdminDatabase();
  await db`
    update workspaces set plan = ${input.plan}, subscription_status = ${input.status},
      subscription_due_at = ${input.dueAt || null},
      stripe_customer_id = coalesce(${input.stripeCustomerId || null}, stripe_customer_id),
      stripe_subscription_id = coalesce(${input.stripeSubscriptionId || null}, stripe_subscription_id)
    where id = ${input.workspaceId}
  `;
}

export async function releasePaidBotRequests(workspaceId: string) {
  const db = requireAdminDatabase();
  await db`
    update bot_requests set status='submitted',
      admin_notes='Payment activated by Vox admin. Ready for review.',
      updated_at=now()
    where workspace_id=${workspaceId} and status='payment_required'
  `;
}

export async function findWorkspaceByStripeSubscription(subscriptionId: string): Promise<string | undefined> {
  if (!sql) return undefined;
  const rows = await sql`select id from workspaces where stripe_subscription_id = ${subscriptionId} limit 1`;
  return rows.length ? rows[0].id as string : undefined;
}

export async function listAdminClients(): Promise<AdminClientRecord[]> {
  const db = requireAdminDatabase();
  const rows = await db`
    select w.*, coalesce(owner.name, '') owner_name, coalesce(owner.email, '') owner_email,
      (select count(*)::int from users u where u.workspace_id = w.id) users,
      (select count(*)::int from agents a where a.workspace_id = w.id) bots
    from workspaces w
    left join lateral (
      select name, email from users where workspace_id = w.id order by created_at asc limit 1
    ) owner on true order by w.created_at desc
  `;
  return rows.map((r) => ({
    workspaceId: r.id as string,
    workspaceName: r.name as string,
    plan: r.plan as string,
    subscriptionStatus: r.subscription_status as SubscriptionStatus,
    subscriptionDueAt: r.subscription_due_at ? new Date(r.subscription_due_at as string).toISOString() : undefined,
    stripeCustomerId: (r.stripe_customer_id as string) || undefined,
    ownerName: r.owner_name as string,
    ownerEmail: r.owner_email as string,
    users: Number(r.users),
    bots: Number(r.bots),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

export async function upsertCompanyProfile(profile: CompanyProfile): Promise<void> {
  if (!sql) return;
  await sql`
    insert into company_profiles (workspace_id, business_name, industry, description, services,
      business_hours, languages, tone, escalation, updated_at, company_phone,
      routing_phone, transfer_phone, whatsapp_phone, timezone, business_schedule)
    values (${profile.workspaceId}, ${profile.businessName}, ${profile.industry}, ${profile.description},
      ${profile.services}, ${profile.businessHours}, ${profile.languages}, ${profile.tone},
      ${profile.escalation}, ${profile.updatedAt}, ${profile.companyPhone ?? null},
      ${profile.routingPhone ?? null}, ${profile.transferPhone ?? null},
      ${profile.whatsappPhone ?? null}, ${profile.timezone ?? "Africa/Harare"},
      ${sql.json(profile.businessSchedule ?? [])})
    on conflict (workspace_id) do update set business_name = excluded.business_name,
      industry = excluded.industry, description = excluded.description, services = excluded.services,
      business_hours = excluded.business_hours, languages = excluded.languages, tone = excluded.tone,
      escalation = excluded.escalation, company_phone=excluded.company_phone,
      routing_phone=excluded.routing_phone, transfer_phone=excluded.transfer_phone,
      whatsapp_phone=excluded.whatsapp_phone, timezone=excluded.timezone,
      business_schedule=excluded.business_schedule,
      updated_at = excluded.updated_at
  `;
}

export async function getCompanyProfile(workspaceId: string): Promise<CompanyProfile | undefined> {
  if (!sql) return undefined;
  const rows = await sql`select * from company_profiles where workspace_id = ${workspaceId} limit 1`;
  if (!rows.length) return undefined;
  const r = rows[0];
  return { workspaceId, businessName: r.business_name as string, industry: r.industry as string,
    description: r.description as string, services: r.services as string, businessHours: r.business_hours as string,
    languages: r.languages as string, tone: r.tone as string, escalation: r.escalation as string,
    companyPhone: (r.company_phone as string) || undefined,
    routingPhone: (r.routing_phone as string) || undefined,
    transferPhone: (r.transfer_phone as string) || undefined,
    whatsappPhone: (r.whatsapp_phone as string) || undefined,
    timezone: (r.timezone as string) || "Africa/Harare",
    businessSchedule: (r.business_schedule as CompanyProfile["businessSchedule"]) ?? [],
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at) };
}

/* ---- knowledge sources ---------------------------------------------------- */

export async function listKnowledgeSources(
  workspaceId = "ws_demo"
): Promise<KnowledgeSource[]> {
  if (!sql) return mockKnowledgeSources;
  const rows = await sql`
    select * from knowledge_sources where workspace_id = ${workspaceId}
    order by updated_at desc
  `;
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    type: r.type as KnowledgeSource["type"],
    status: r.status as KnowledgeSource["status"],
    chunks: Number(r.chunks),
    updatedAt:
      r.updated_at instanceof Date
        ? (r.updated_at as Date).toISOString()
        : String(r.updated_at),
  }));
}

export async function deleteKnowledgeSource(id: string, workspaceId: string): Promise<boolean> {
  if (!sql) return false;
  const rows = await sql.begin(async (tx) => {
    await tx`delete from knowledge_chunks where source_id=${id} and workspace_id=${workspaceId}`;
    return tx`delete from knowledge_sources where id=${id} and workspace_id=${workspaceId} returning id`;
  });
  return rows.length > 0;
}

/* ---- users & workspaces --------------------------------------------------- */

export type DbUser = {
  id: string;
  workspaceId: string;
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  status: string;
};

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  if (!sql) return null;
  const rows = await sql`select * from users where email = ${email.toLowerCase()} limit 1`;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    email: r.email as string,
    passwordHash: r.password_hash as string,
    name: r.name as string,
    role: r.role as string,
    status: String(r.status ?? "active"),
  };
}

export async function findActiveUserBySession(
  userId: string,
  workspaceId: string
): Promise<DbUser | null> {
  if (!sql) return null;
  const rows = await sql`
    select * from users
    where id = ${userId} and workspace_id = ${workspaceId} and status = 'active'
    limit 1
  `;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    email: r.email as string,
    passwordHash: r.password_hash as string,
    name: r.name as string,
    role: r.role as string,
    status: String(r.status),
  };
}

export async function createWorkspaceWithOwner(opts: {
  workspaceName: string;
  email: string;
  name: string;
  passwordHash: string;
}): Promise<DbUser> {
  if (!sql) throw new Error("DATABASE_URL is not set");
  const wsId = "ws_" + crypto.randomUUID();
  const userId = "u_" + crypto.randomUUID();
  await sql.begin(async (tx) => {
    await tx`insert into workspaces (id, name) values (${wsId}, ${opts.workspaceName})`;
    await tx`
      insert into users (id, workspace_id, email, password_hash, name, role)
      values (${userId}, ${wsId}, ${opts.email.toLowerCase()}, ${opts.passwordHash}, ${opts.name}, 'Owner')
    `;
  });
  return {
    id: userId,
    workspaceId: wsId,
    email: opts.email.toLowerCase(),
    passwordHash: opts.passwordHash,
    name: opts.name,
    role: "Owner",
    status: "active",
  };
}

export async function updateWorkspaceUser(opts: {
  workspaceId: string; userId: string; role?: string; status?: string;
}) {
  if (!sql) return;
  if (opts.role) await sql`
    update users set role=${opts.role} where id=${opts.userId}
      and workspace_id=${opts.workspaceId} and role <> 'Owner'
  `;
  if (opts.status) await sql`
    update users set status=${opts.status} where id=${opts.userId}
      and workspace_id=${opts.workspaceId} and role <> 'Owner'
  `;
}

export async function insertSmsMessage(opts: {
  workspaceId: string; to: string; from: string; body: string;
  createdBy: string; status: string; twilioSid?: string; errorMessage?: string;
}) {
  if (!sql) return;
  await sql`
    insert into sms_messages(id,workspace_id,to_number,from_number,body,status,twilio_sid,error_message,created_by)
    values(${"sms_" + crypto.randomUUID()},${opts.workspaceId},${opts.to},${opts.from},${opts.body},
      ${opts.status},${opts.twilioSid ?? null},${opts.errorMessage ?? null},${opts.createdBy})
  `;
}

export async function listSmsMessages(workspaceId: string) {
  if (!sql) return [];
  return sql`select * from sms_messages where workspace_id=${workspaceId} order by created_at desc limit 100`;
}

export async function getOperationsSnapshot() {
  const db = requireAdminDatabase();
  const started = Date.now();
  const [row] = await db`
    select
      (select count(*)::int from crm_deliveries where status='failed') as failed_crm,
      (select count(*)::int from sms_messages where status='failed') as failed_sms,
      (select count(*)::int from voice_call_sessions
        where updated_at >= now() - interval '5 minutes') as active_calls,
      (select count(*)::int from users where status='active') as users,
      (select count(*)::int from agents where status='active') as agents
  `;
  return {
    failedCrm: Number(row.failed_crm), failedSms: Number(row.failed_sms),
    activeCalls: Number(row.active_calls), users: Number(row.users), agents: Number(row.agents),
    databaseLatency: Date.now() - started,
  };
}

export async function getWorkspaceName(workspaceId = "ws_demo"): Promise<string> {
  if (!sql) return "Bright Smile Dental";
  const rows = await sql`select name from workspaces where id = ${workspaceId} limit 1`;
  return rows.length ? (rows[0].name as string) : "Your Business";
}

export async function workspaceExists(workspaceId: string): Promise<boolean> {
  if (!sql) return workspaceId === "ws_demo";
  const rows = await sql`select 1 from workspaces where id=${workspaceId} limit 1`;
  return rows.length > 0;
}

export async function createTeamInvitation(opts: {
  workspaceId: string; email: string; role: string; tokenHash: string; invitedBy: string;
}) {
  if (!sql) throw new Error("DATABASE_URL is not set");
  const id = "inv_" + crypto.randomUUID();
  await sql`
    insert into team_invitations
      (id, workspace_id, email, role, token_hash, invited_by, expires_at)
    values (${id}, ${opts.workspaceId}, ${opts.email.toLowerCase()}, ${opts.role},
      ${opts.tokenHash}, ${opts.invitedBy}, now() + interval '7 days')
  `;
  return id;
}

export async function getTeamInvitation(tokenHash: string) {
  if (!sql) return null;
  const rows = await sql`
    select * from team_invitations
    where token_hash=${tokenHash} and accepted_at is null and revoked_at is null
      and expires_at > now() limit 1
  `;
  return rows[0] ?? null;
}

export async function acceptTeamInvitation(opts: {
  tokenHash: string; name: string; passwordHash: string;
}) {
  if (!sql) throw new Error("DATABASE_URL is not set");
  const invite = await getTeamInvitation(opts.tokenHash);
  if (!invite) throw new Error("This invitation is invalid or expired.");
  const id = "u_" + crypto.randomUUID();
  await sql.begin(async (tx) => {
    await tx`
      insert into users (id, workspace_id, email, password_hash, name, role)
      values (${id}, ${invite.workspace_id}, ${invite.email}, ${opts.passwordHash},
        ${opts.name}, ${invite.role})
    `;
    await tx`update team_invitations set accepted_at=now() where id=${invite.id}`;
  });
  return findUserByEmail(String(invite.email));
}

export async function listTeamInvitations(workspaceId: string) {
  if (!sql) return [];
  return sql`
    select id,email,role,expires_at,accepted_at,created_at from team_invitations
    where workspace_id=${workspaceId} order by created_at desc limit 20
  `;
}

export async function getOrCreateWidgetConfig(workspaceId: string, agentId: string) {
  if (!sql) return null;
  await sql`
    insert into widget_configs (workspace_id, public_token, agent_id)
    values (${workspaceId}, ${"wgt_" + crypto.randomUUID()}, ${agentId})
    on conflict (workspace_id) do nothing
  `;
  const rows = await sql`select * from widget_configs where workspace_id=${workspaceId} limit 1`;
  return rows[0] ?? null;
}

export async function getWidgetByToken(token: string) {
  if (!sql) return null;
  const rows = await sql`
    select * from widget_configs where public_token=${token} and enabled=true limit 1
  `;
  return rows[0] ?? null;
}

export async function updateWidgetConfig(opts: {
  workspaceId: string; allowedDomains: string[]; title: string; welcomeMessage: string;
}) {
  if (!sql) throw new Error("DATABASE_URL is not set");
  await sql`
    update widget_configs set allowed_domains=${sql.json(opts.allowedDomains)},
      title=${opts.title}, welcome_message=${opts.welcomeMessage}, updated_at=now()
    where workspace_id=${opts.workspaceId}
  `;
}

export async function consumeWidgetRateLimit(token: string, identity: string, limit = 20) {
  if (!sql) return true;
  const minute = Math.floor(Date.now() / 60000);
  const bucket = `${token}:${identity}:${minute}`;
  const rows = await sql`
    insert into widget_rate_limits (bucket,request_count,expires_at)
    values (${bucket},1,now() + interval '2 minutes')
    on conflict (bucket) do update set request_count=widget_rate_limits.request_count + 1
    returning request_count
  `;
  if (Math.random() < 0.02) await sql`delete from widget_rate_limits where expires_at < now()`;
  return Number(rows[0].request_count) <= limit;
}

export async function revokeTeamInvitation(id: string, workspaceId: string) {
  if (!sql) return;
  await sql`
    update team_invitations set revoked_at=now()
    where id=${id} and workspace_id=${workspaceId} and accepted_at is null
  `;
}

export async function saveCrmConnection(opts: {
  workspaceId: string; name: string; webhookUrl: string; secretEncrypted?: string;
}) {
  if (!sql) throw new Error("DATABASE_URL is not set");
  await sql`
    insert into crm_connections (workspace_id,name,webhook_url,secret_encrypted)
    values (${opts.workspaceId},${opts.name},${opts.webhookUrl},${opts.secretEncrypted ?? null})
    on conflict (workspace_id) do update set name=excluded.name,
      webhook_url=excluded.webhook_url, secret_encrypted=excluded.secret_encrypted,
      enabled=true, updated_at=now()
  `;
}

export async function getCrmConnection(workspaceId: string) {
  if (!sql) return null;
  const rows = await sql`select * from crm_connections where workspace_id=${workspaceId} limit 1`;
  return rows[0] ?? null;
}

export async function createCrmDelivery(workspaceId: string, payload: Record<string, unknown>) {
  if (!sql) return null;
  const id = "crm_" + crypto.randomUUID();
  await sql`
    insert into crm_deliveries(id,workspace_id,payload)
    values(${id},${workspaceId},${sql.json(JSON.parse(JSON.stringify(payload)))})
  `;
  return id;
}

export async function finishCrmDelivery(id: string, ok: boolean, status?: number, error?: string) {
  if (!sql) return;
  await sql`
    update crm_deliveries set status=${ok ? "delivered" : "failed"},
      attempts=attempts+1,response_status=${status ?? null},last_error=${error ?? null},updated_at=now()
    where id=${id}
  `;
}

export async function listCrmDeliveries(workspaceId: string) {
  if (!sql) return [];
  return sql`select * from crm_deliveries where workspace_id=${workspaceId} order by created_at desc limit 20`;
}

export async function addAuditEvent(workspaceId: string, actorEmail: string, action: string, details = {}) {
  if (!sql) return;
  await sql`
    insert into audit_events (id,workspace_id,actor_email,action,details)
    values (${"aud_" + crypto.randomUUID()},${workspaceId},${actorEmail},${action},${sql.json(details)})
  `;
}

export async function listAuditEvents(workspaceId: string) {
  if (!sql) return [];
  return sql`
    select * from audit_events where workspace_id=${workspaceId}
    order by created_at desc limit 25
  `;
}

/* ---- team inbox and human handoff ---------------------------------------- */

export type ConversationAutomationState = {
  id: string;
  workspaceId: string;
  inboxStatus: InboxStatus;
  botMode: ConversationBotMode;
  priority: ConversationPriority;
  assignedUserId?: string;
  stateVersion: number;
};

type EnsureInboxConversationInput = {
  id: string;
  workspaceId: string;
  agentId: string;
  channel: Conversation["channel"];
  contact: string;
  startedAt?: string;
  businessAddress?: string;
};

export type AppendConversationMessageInput = {
  id?: string;
  workspaceId: string;
  conversationId: string;
  authorType: ConversationMessageAuthor;
  authorUserId?: string;
  authorName?: string;
  body: string;
  channel: Conversation["channel"];
  direction?: ConversationMessageDirection;
  deliveryStatus?: ConversationMessageDelivery;
  providerMessageSid?: string;
  idempotencyKey?: string;
};

function isoDate(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function rowToConversationMessage(row: Record<string, unknown>): ConversationMessage {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    conversationId: String(row.conversation_id),
    sequence: Number(row.sequence_no),
    channel: row.channel as Conversation["channel"],
    direction: row.direction as ConversationMessageDirection,
    authorType: row.author_type as ConversationMessageAuthor,
    authorUserId: row.author_user_id ? String(row.author_user_id) : undefined,
    authorName: row.author_name ? String(row.author_name) : undefined,
    body: String(row.body),
    deliveryStatus: row.delivery_status as ConversationMessageDelivery,
    providerMessageSid: row.provider_message_sid ? String(row.provider_message_sid) : undefined,
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : undefined,
    deliveryError: row.delivery_error ? String(row.delivery_error) : undefined,
    createdAt: isoDate(row.created_at),
    updatedAt: isoDate(row.updated_at),
  };
}

function rowToConversationNote(row: Record<string, unknown>): ConversationNote {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    conversationId: String(row.conversation_id),
    authorUserId: String(row.author_user_id),
    authorName: String(row.author_name),
    body: String(row.body),
    createdAt: isoDate(row.created_at),
  };
}

function rowToNotification(row: Record<string, unknown>): InboxNotification {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    userId: String(row.user_id),
    conversationId: row.conversation_id ? String(row.conversation_id) : undefined,
    type: String(row.type),
    title: String(row.title),
    body: String(row.body),
    readAt: row.read_at ? isoDate(row.read_at) : undefined,
    createdAt: isoDate(row.created_at),
  };
}

function automationState(row: Record<string, unknown>): ConversationAutomationState {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    inboxStatus: row.inbox_status as InboxStatus,
    botMode: row.bot_mode as ConversationBotMode,
    priority: row.priority as ConversationPriority,
    assignedUserId: row.assigned_user_id ? String(row.assigned_user_id) : undefined,
    stateVersion: Number(row.state_version),
  };
}

function demoInboxRecord(conversation: Conversation, workspaceId: string): InboxConversation {
  const key = `${workspaceId}:${conversation.id}`;
  const existing = demoInbox.get(key);
  if (existing) return existing;
  const messages: ConversationMessage[] = conversation.transcript.map((line, index) => ({
    id: `demo_msg_${conversation.id}_${index}`,
    workspaceId,
    conversationId: conversation.id,
    sequence: index + 1,
    channel: conversation.channel,
    direction: line.role === "caller" ? "inbound" : "outbound",
    authorType: line.role === "caller" ? "customer" : "bot",
    body: line.text,
    deliveryStatus: line.role === "caller" ? "received" : "delivered",
    createdAt: conversation.startedAt,
    updatedAt: conversation.startedAt,
  }));
  const record: InboxConversation = {
    ...conversation,
    workspaceId,
    inboxStatus: "ai_active",
    botMode: "active",
    priority: "normal",
    lastMessageAt: conversation.startedAt,
    lastMessagePreview: messages.at(-1)?.body ?? conversation.summary,
    stateVersion: 0,
    unreadCount: messages.filter((message) => message.direction === "inbound").length,
    messages,
    notes: [],
  };
  demoInbox.set(key, record);
  return record;
}

function hydrateInboxConversation(
  row: Record<string, unknown>,
  messages: ConversationMessage[],
  notes: ConversationNote[]
): InboxConversation {
  return {
    ...rowToConversation(row),
    workspaceId: String(row.workspace_id),
    businessAddress: row.business_address ? String(row.business_address) : undefined,
    inboxStatus: row.inbox_status as InboxStatus,
    botMode: row.bot_mode as ConversationBotMode,
    priority: row.priority as ConversationPriority,
    assignedUserId: row.assigned_user_id ? String(row.assigned_user_id) : undefined,
    assignedUserName: row.assigned_user_name ? String(row.assigned_user_name) : undefined,
    handoffReason: row.handoff_reason ? String(row.handoff_reason) : undefined,
    handoffRequestedAt: row.handoff_requested_at ? isoDate(row.handoff_requested_at) : undefined,
    humanFirstResponseAt: row.human_first_response_at ? isoDate(row.human_first_response_at) : undefined,
    resolvedAt: row.resolved_at ? isoDate(row.resolved_at) : undefined,
    lastMessageAt: isoDate(row.last_message_at),
    lastMessagePreview: String(row.last_message_preview ?? ""),
    stateVersion: Number(row.state_version),
    unreadCount: Number(row.unread_count ?? 0),
    messages,
    notes,
  };
}

export async function ensureInboxConversation(
  input: EnsureInboxConversationInput
): Promise<ConversationAutomationState> {
  if (!sql) {
    const base: Conversation = {
      id: input.id, agentId: input.agentId, channel: input.channel,
      contact: input.contact, startedAt: input.startedAt ?? new Date().toISOString(),
      durationSec: 0, sentiment: "neutral", outcome: "answered", summary: "",
      actionItems: [], transcript: [],
    };
    const record = demoInboxRecord(base, input.workspaceId);
    return {
      id: record.id, workspaceId: record.workspaceId, inboxStatus: record.inboxStatus,
      botMode: record.botMode, priority: record.priority,
      assignedUserId: record.assignedUserId, stateVersion: record.stateVersion,
    };
  }
  const rows = await sql`
    insert into conversations (id,workspace_id,agent_id,channel,contact,started_at,
      duration_sec,sentiment,outcome,summary,action_items,transcript,business_address,last_message_at)
    values (${input.id},${input.workspaceId},${input.agentId},${input.channel},${input.contact},
      ${input.startedAt ?? new Date().toISOString()},0,'neutral','answered','',${sql.json([])},
      ${sql.json([])},${input.businessAddress ?? null},${input.startedAt ?? new Date().toISOString()})
    on conflict (id) do update set
      contact=excluded.contact,
      business_address=coalesce(excluded.business_address,conversations.business_address),
      updated_at=now()
    where conversations.workspace_id=excluded.workspace_id
      and conversations.agent_id=excluded.agent_id
    returning *
  `;
  if (!rows.length) throw new Error("Conversation belongs to another workspace or agent.");
  return automationState(rows[0]);
}

export async function listConversationMessages(
  conversationId: string,
  workspaceId: string,
  options: { afterSequence?: number; limit?: number; customerVisibleOnly?: boolean } = {}
): Promise<ConversationMessage[]> {
  const after = Math.max(0, Math.floor(options.afterSequence ?? 0));
  const limit = Math.min(500, Math.max(1, Math.floor(options.limit ?? 200)));
  if (!sql) {
    const record = demoInbox.get(`${workspaceId}:${conversationId}`) ??
      mockConversations.find((conversation) => conversation.id === conversationId);
    const messages: ConversationMessage[] = record && "messages" in record
      ? record.messages as ConversationMessage[]
      : record ? demoInboxRecord(record, workspaceId).messages : [];
    return messages.filter((message) =>
      message.sequence > after && (!options.customerVisibleOnly || message.authorType !== "system")
    ).slice(0, limit);
  }
  const rows = await sql`
    select * from conversation_messages
    where workspace_id=${workspaceId} and conversation_id=${conversationId}
      and sequence_no > ${after}
      and (${Boolean(options.customerVisibleOnly)}=false or author_type<>'system')
    order by sequence_no asc limit ${limit}
  `;
  return rows.map(rowToConversationMessage);
}

export async function appendConversationMessage(
  input: AppendConversationMessageInput
): Promise<{ message: ConversationMessage; created: boolean }> {
  const body = input.body.trim();
  if (!body || body.length > 10_000) throw new Error("Message must be between 1 and 10,000 characters.");
  const id = input.id ?? `msg_${crypto.randomUUID()}`;
  const direction = input.direction ?? (input.authorType === "customer" ? "inbound" : "outbound");
  const deliveryStatus = input.deliveryStatus ?? (direction === "inbound" ? "received" : "pending");
  if (input.authorType === "human" && !input.authorUserId) throw new Error("A human message requires an author.");
  if (input.authorType !== "human" && input.authorUserId) throw new Error("Only human messages may have a user author.");

  if (!sql) {
    const key = `${input.workspaceId}:${input.conversationId}`;
    const record = demoInbox.get(key);
    if (!record) throw new Error("Conversation not found.");
    const duplicate = record.messages.find((message) =>
      message.id === id ||
      Boolean(input.idempotencyKey && message.idempotencyKey === input.idempotencyKey) ||
      Boolean(input.providerMessageSid && message.providerMessageSid === input.providerMessageSid)
    );
    if (duplicate) return { message: duplicate, created: false };
    const now = new Date().toISOString();
    const message: ConversationMessage = {
      id, workspaceId: input.workspaceId, conversationId: input.conversationId,
      sequence: (record.messages.at(-1)?.sequence ?? 0) + 1, channel: input.channel,
      direction, authorType: input.authorType, authorUserId: input.authorUserId,
      authorName: input.authorName, body, deliveryStatus,
      providerMessageSid: input.providerMessageSid, idempotencyKey: input.idempotencyKey,
      createdAt: now, updatedAt: now,
    };
    record.messages.push(message);
    record.lastMessageAt = now;
    record.lastMessagePreview = body.slice(0, 240);
    if (direction === "inbound") record.unreadCount += 1;
    if (record.inboxStatus === "resolved" && direction === "inbound") {
      record.inboxStatus = "ai_active";
      record.botMode = "active";
      record.resolvedAt = undefined;
      record.stateVersion += 1;
    }
    if (input.authorType === "human") {
      record.inboxStatus = "human_active";
      record.botMode = "paused";
      record.assignedUserId ??= input.authorUserId;
      record.humanFirstResponseAt ??= now;
      record.stateVersion += 1;
    }
    return { message, created: true };
  }

  return sql.begin(async (tx) => {
    const inserted = await tx`
      insert into conversation_messages (id,workspace_id,conversation_id,channel,direction,
        author_type,author_user_id,author_name,body,delivery_status,provider_message_sid,idempotency_key)
      values (${id},${input.workspaceId},${input.conversationId},${input.channel},${direction},
        ${input.authorType},${input.authorUserId ?? null},${input.authorName ?? null},${body},
        ${deliveryStatus},${input.providerMessageSid ?? null},${input.idempotencyKey ?? null})
      on conflict do nothing returning *
    `;
    let row = inserted[0];
    if (!row) {
      const existing = await tx`
        select * from conversation_messages
        where workspace_id=${input.workspaceId} and (
          id=${id}
          or (${input.idempotencyKey ?? null}::text is not null and idempotency_key=${input.idempotencyKey ?? null})
          or (${input.providerMessageSid ?? null}::text is not null and provider_message_sid=${input.providerMessageSid ?? null})
        ) order by sequence_no desc limit 1
      `;
      if (!existing.length) throw new Error("Message conflicts with another workspace record.");
      return { message: rowToConversationMessage(existing[0]), created: false };
    }
    const transcriptRole = input.authorType === "customer" ? "caller" : "agent";
    const human = input.authorType === "human";
    const inbound = direction === "inbound";
    const updated = await tx`
      update conversations set
        last_message_at=${row.created_at}, last_message_preview=${body.slice(0, 240)}, updated_at=now(),
        transcript=case when ${input.authorType}='system' then transcript else
          transcript || jsonb_build_array(jsonb_build_object('role',${transcriptRole}::text,'text',${body}::text)) end,
        inbox_status=case
          when ${human} then 'human_active'
          when ${inbound} and inbox_status='resolved' then 'ai_active'
          else inbox_status end,
        bot_mode=case
          when ${human} then 'paused'
          when ${inbound} and inbox_status='resolved' then 'active'
          else bot_mode end,
        assigned_user_id=case when ${human} then coalesce(assigned_user_id,${input.authorUserId ?? null}) else assigned_user_id end,
        assigned_at=case when ${human} then coalesce(assigned_at,now()) else assigned_at end,
        human_first_response_at=case when ${human} then coalesce(human_first_response_at,now()) else human_first_response_at end,
        resolved_at=case when ${inbound} and inbox_status='resolved' then null else resolved_at end,
        state_version=state_version + case when ${human} or (${inbound} and inbox_status='resolved') then 1 else 0 end
      where id=${input.conversationId} and workspace_id=${input.workspaceId}
      returning id,inbox_status,bot_mode,assigned_user_id
    `;
    if (!updated.length) throw new Error("Conversation not found.");
    if (inbound && (
      updated[0].inbox_status === "needs_human" ||
      updated[0].inbox_status === "human_active" ||
      updated[0].bot_mode === "paused"
    )) {
      const assignedUserId = updated[0].assigned_user_id
        ? String(updated[0].assigned_user_id)
        : null;
      await tx`
        insert into inbox_notifications
          (id,workspace_id,user_id,conversation_id,type,title,body,dedupe_key)
        select 'ntf_' || gen_random_uuid()::text,${input.workspaceId},u.id,
          ${input.conversationId},'customer_reply','New customer reply',
          ${body.slice(0, 240)},${`message:${id}`}
        from users u
        where u.workspace_id=${input.workspaceId} and u.status='active'
          and u.role in ('Owner','Admin','Agent')
          and (
            (${assignedUserId}::text is not null and u.id=${assignedUserId})
            or (${assignedUserId}::text is null)
          )
        on conflict do nothing
      `;
    }
    row = inserted[0];
    return { message: rowToConversationMessage(row), created: true };
  });
}

export async function appendBotMessageIfAutomationActive(
  input: Omit<AppendConversationMessageInput, "authorType" | "authorUserId" | "direction"> & {
    expectedStateVersion?: number;
  }
): Promise<{ message?: ConversationMessage; created: boolean; automationActive: boolean }> {
  const body = input.body.trim();
  if (!body || body.length > 10_000) throw new Error("Message must be between 1 and 10,000 characters.");
  if (!sql) {
    const record = demoInbox.get(`${input.workspaceId}:${input.conversationId}`);
    const active = Boolean(record && record.inboxStatus === "ai_active" && record.botMode === "active" &&
      (input.expectedStateVersion === undefined || record.stateVersion === input.expectedStateVersion));
    if (!active) return { created: false, automationActive: false };
    const result = await appendConversationMessage({ ...input, authorType: "bot", direction: "outbound" });
    return { ...result, automationActive: true };
  }
  return sql.begin(async (tx) => {
    const states = await tx`
      select * from conversations
      where id=${input.conversationId} and workspace_id=${input.workspaceId}
      for update
    `;
    const state = states[0];
    const active = Boolean(state && state.inbox_status === "ai_active" && state.bot_mode === "active" &&
      (input.expectedStateVersion === undefined || Number(state.state_version) === input.expectedStateVersion));
    if (!active) return { created: false, automationActive: false };
    const id = input.id ?? `msg_${crypto.randomUUID()}`;
    const inserted = await tx`
      insert into conversation_messages (id,workspace_id,conversation_id,channel,direction,
        author_type,author_name,body,delivery_status,provider_message_sid,idempotency_key)
      values (${id},${input.workspaceId},${input.conversationId},${input.channel},'outbound','bot',
        ${input.authorName ?? null},${body},${input.deliveryStatus ?? "pending"},
        ${input.providerMessageSid ?? null},${input.idempotencyKey ?? null})
      on conflict do nothing returning *
    `;
    if (!inserted.length) {
      const existing = await tx`
        select * from conversation_messages where workspace_id=${input.workspaceId} and (
          id=${id}
          or (${input.idempotencyKey ?? null}::text is not null and idempotency_key=${input.idempotencyKey ?? null})
          or (${input.providerMessageSid ?? null}::text is not null and provider_message_sid=${input.providerMessageSid ?? null})
        ) order by sequence_no desc limit 1
      `;
      return {
        message: existing[0] ? rowToConversationMessage(existing[0]) : undefined,
        created: false,
        automationActive: true,
      };
    }
    await tx`
      update conversations set last_message_at=${inserted[0].created_at},
        last_message_preview=${body.slice(0, 240)},updated_at=now(),
        transcript=transcript || jsonb_build_array(jsonb_build_object('role','agent','text',${body}::text))
      where id=${input.conversationId} and workspace_id=${input.workspaceId}
    `;
    return { message: rowToConversationMessage(inserted[0]), created: true, automationActive: true };
  });
}

export async function getConversationAutomationState(
  conversationId: string,
  workspaceId: string
): Promise<ConversationAutomationState | null> {
  if (!sql) {
    const record = demoInbox.get(`${workspaceId}:${conversationId}`);
    return record ? {
      id: record.id, workspaceId, inboxStatus: record.inboxStatus, botMode: record.botMode,
      priority: record.priority, assignedUserId: record.assignedUserId, stateVersion: record.stateVersion,
    } : null;
  }
  const rows = await sql`
    select id,workspace_id,inbox_status,bot_mode,priority,assigned_user_id,state_version
    from conversations where id=${conversationId} and workspace_id=${workspaceId} limit 1
  `;
  return rows[0] ? automationState(rows[0]) : null;
}

export async function listInboxConversations(
  workspaceId: string,
  userId: string
): Promise<InboxConversation[]> {
  if (!sql) return mockConversations.map((conversation) => demoInboxRecord(conversation, workspaceId));
  const rows = await sql`
    select c.*,u.name assigned_user_name,
      coalesce((select count(*)::int from conversation_messages m
        where m.workspace_id=c.workspace_id and m.conversation_id=c.id
          and m.direction='inbound' and m.sequence_no>coalesce(cr.last_read_sequence,0)),0) unread_count
    from conversations c
    left join users u on u.id=c.assigned_user_id and u.workspace_id=c.workspace_id
    left join conversation_reads cr on cr.workspace_id=c.workspace_id
      and cr.conversation_id=c.id and cr.user_id=${userId}
    where c.workspace_id=${workspaceId}
    order by
      case c.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
      c.last_message_at desc
  `;
  if (!rows.length) return [];
  // List rows only need the latest preview. The selected thread is hydrated
  // separately, avoiding an all-messages query on every 10-second inbox poll.
  return rows.map((row) => hydrateInboxConversation(row, [], []));
}

export async function getInboxConversation(
  id: string,
  workspaceId: string,
  userId: string
): Promise<InboxConversation | undefined> {
  if (!sql) {
    const existing = demoInbox.get(`${workspaceId}:${id}`);
    if (existing) return existing;
    const base = mockConversations.find((conversation) => conversation.id === id);
    return base ? demoInboxRecord(base, workspaceId) : undefined;
  }
  const rows = await sql`
    select c.*,u.name assigned_user_name,
      coalesce((select count(*)::int from conversation_messages m
        where m.workspace_id=c.workspace_id and m.conversation_id=c.id
          and m.direction='inbound' and m.sequence_no>coalesce(cr.last_read_sequence,0)),0) unread_count
    from conversations c
    left join users u on u.id=c.assigned_user_id and u.workspace_id=c.workspace_id
    left join conversation_reads cr on cr.workspace_id=c.workspace_id
      and cr.conversation_id=c.id and cr.user_id=${userId}
    where c.id=${id} and c.workspace_id=${workspaceId} limit 1
  `;
  if (!rows.length) return undefined;
  const [messages, notes] = await Promise.all([
    listConversationMessages(id, workspaceId, { limit: 500 }),
    sql`select * from conversation_notes where workspace_id=${workspaceId}
      and conversation_id=${id} order by created_at asc`,
  ]);
  return hydrateInboxConversation(rows[0], messages, notes.map(rowToConversationNote));
}

export async function updateInboxConversationState(input: {
  workspaceId: string;
  conversationId: string;
  inboxStatus?: InboxStatus;
  botMode?: ConversationBotMode;
  priority?: ConversationPriority;
  assignedUserId?: string | null;
  expectedStateVersion?: number;
}): Promise<ConversationAutomationState | null> {
  if (!sql) {
    const record = demoInbox.get(`${input.workspaceId}:${input.conversationId}`);
    if (!record || (input.expectedStateVersion !== undefined && record.stateVersion !== input.expectedStateVersion)) return null;
    if (input.inboxStatus) record.inboxStatus = input.inboxStatus;
    if (input.botMode) record.botMode = input.botMode;
    if (input.priority) record.priority = input.priority;
    if (input.assignedUserId !== undefined) record.assignedUserId = input.assignedUserId ?? undefined;
    if (record.inboxStatus === "ai_active") record.botMode = input.botMode ?? "active";
    if (["needs_human", "human_active"].includes(record.inboxStatus)) record.botMode = "paused";
    record.resolvedAt = record.inboxStatus === "resolved" ? new Date().toISOString() : undefined;
    record.stateVersion += 1;
    return { id: record.id, workspaceId: record.workspaceId, inboxStatus: record.inboxStatus,
      botMode: record.botMode, priority: record.priority, assignedUserId: record.assignedUserId,
      stateVersion: record.stateVersion };
  }
  return sql.begin(async (tx) => {
    const rows = await tx`
      select * from conversations where id=${input.conversationId}
        and workspace_id=${input.workspaceId} for update
    `;
    if (!rows.length) return null;
    const current = rows[0];
    if (input.expectedStateVersion !== undefined && Number(current.state_version) !== input.expectedStateVersion) return null;
    const status = input.inboxStatus ?? current.inbox_status as InboxStatus;
    const botMode = input.botMode ?? (status === "ai_active" ? "active" :
      status === "needs_human" || status === "human_active" ? "paused" : current.bot_mode) as ConversationBotMode;
    const priority = input.priority ?? current.priority as ConversationPriority;
    const assigned = input.assignedUserId === undefined ? current.assigned_user_id : input.assignedUserId;
    const updated = await tx`
      update conversations set inbox_status=${status},bot_mode=${botMode},priority=${priority},
        assigned_user_id=${assigned ?? null},
        assigned_at=case when ${assigned ?? null}::text is null then null else coalesce(assigned_at,now()) end,
        resolved_at=case when ${status}='resolved' then coalesce(resolved_at,now()) else null end,
        state_version=state_version+1,updated_at=now()
      where id=${input.conversationId} and workspace_id=${input.workspaceId}
      returning *
    `;
    return automationState(updated[0]);
  });
}

export const transitionInboxConversation = updateInboxConversationState;

export async function setInboxPriority(input: {
  workspaceId: string; conversationId: string; priority: ConversationPriority;
}) {
  return updateInboxConversationState(input);
}

export async function assignInboxConversation(input: {
  workspaceId: string; conversationId: string; assignedUserId: string | null;
}) {
  return updateInboxConversationState(input);
}

export async function createHandoffNotifications(input: {
  workspaceId: string;
  conversationId: string;
  title?: string;
  body?: string;
  dedupeKey?: string;
}): Promise<number> {
  if (!sql) return 0;
  const rows = await sql`
    insert into inbox_notifications (id,workspace_id,user_id,conversation_id,type,title,body,dedupe_key)
    select 'ntf_' || gen_random_uuid()::text,${input.workspaceId},u.id,${input.conversationId},
      'handoff_requested',${input.title ?? "A customer needs human help"},
      ${input.body ?? "Open the team inbox to review and respond."},${input.dedupeKey ?? `handoff:${input.conversationId}`}
    from users u where u.workspace_id=${input.workspaceId} and u.status='active'
      and u.role in ('Owner','Admin','Agent')
    on conflict do nothing returning id
  `;
  return rows.length;
}

export async function requestHumanHandoff(input: {
  workspaceId: string;
  conversationId: string;
  reason?: string;
  priority?: ConversationPriority;
}): Promise<ConversationAutomationState | null> {
  const current = await getConversationAutomationState(input.conversationId, input.workspaceId);
  if (!current) return null;
  const ranks: Record<ConversationPriority, number> = { low: 0, normal: 1, high: 2, urgent: 3 };
  const requested = input.priority ?? "high";
  const priority = ranks[current.priority] >= ranks[requested] ? current.priority : requested;
  if (!sql) {
    return updateInboxConversationState({ workspaceId: input.workspaceId,
      conversationId: input.conversationId, inboxStatus: "needs_human", botMode: "paused", priority });
  }
  const rows = await sql`
    update conversations set inbox_status='needs_human',bot_mode='paused',priority=case
      when priority='urgent' or ${priority}='urgent' then 'urgent'
      when priority='high' or ${priority}='high' then 'high'
      when priority='normal' or ${priority}='normal' then 'normal'
      else 'low' end,
      handoff_reason=coalesce(nullif(${input.reason ?? ""},''),handoff_reason),
      handoff_requested_at=case when inbox_status in ('ai_active','resolved') or handoff_requested_at is null
        then now() else handoff_requested_at end,
      resolved_at=null,state_version=state_version+1,updated_at=now()
    where id=${input.conversationId} and workspace_id=${input.workspaceId}
    returning *
  `;
  if (!rows.length) return null;
  const requestedAt = isoDate(rows[0].handoff_requested_at);
  await createHandoffNotifications({
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    body: input.reason?.trim() || "A customer asked to speak with the team.",
    dedupeKey: `handoff:${input.conversationId}:${requestedAt}`,
  });
  return automationState(rows[0]);
}

export async function addConversationNote(input: {
  workspaceId: string;
  conversationId: string;
  authorUserId: string;
  authorName: string;
  body: string;
}): Promise<ConversationNote> {
  const body = input.body.trim();
  if (!body || body.length > 10_000) throw new Error("Note must be between 1 and 10,000 characters.");
  const id = `note_${crypto.randomUUID()}`;
  if (!sql) {
    const record = demoInbox.get(`${input.workspaceId}:${input.conversationId}`);
    if (!record) throw new Error("Conversation not found.");
    const note: ConversationNote = { id, ...input, body, createdAt: new Date().toISOString() };
    record.notes.push(note);
    return note;
  }
  const rows = await sql`
    insert into conversation_notes(id,workspace_id,conversation_id,author_user_id,author_name,body)
    values(${id},${input.workspaceId},${input.conversationId},${input.authorUserId},${input.authorName},${body})
    returning *
  `;
  return rowToConversationNote(rows[0]);
}

export async function markConversationRead(
  conversationId: string,
  workspaceId: string,
  userId: string
): Promise<number> {
  if (!sql) {
    const record = demoInbox.get(`${workspaceId}:${conversationId}`);
    if (record) record.unreadCount = 0;
    return record?.messages.at(-1)?.sequence ?? 0;
  }
  const rows = await sql`
    insert into conversation_reads(workspace_id,conversation_id,user_id,last_read_sequence,read_at)
    select ${workspaceId},${conversationId},${userId},
      coalesce(max(sequence_no),0),now() from conversation_messages
    where workspace_id=${workspaceId} and conversation_id=${conversationId}
    on conflict(workspace_id,conversation_id,user_id) do update set
      last_read_sequence=greatest(conversation_reads.last_read_sequence,excluded.last_read_sequence),
      read_at=now()
    returning last_read_sequence
  `;
  return Number(rows[0]?.last_read_sequence ?? 0);
}

export async function listNotifications(
  workspaceId: string,
  userId: string,
  limit = 50
): Promise<InboxNotification[]> {
  if (!sql) return demoInboxNotifications.filter((item) =>
    item.workspaceId === workspaceId && item.userId === userId
  ).slice(0, limit);
  const rows = await sql`
    select * from inbox_notifications where workspace_id=${workspaceId} and user_id=${userId}
    order by created_at desc limit ${Math.min(100, Math.max(1, Math.floor(limit)))}
  `;
  return rows.map(rowToNotification);
}

export async function getUnreadNotificationCount(workspaceId: string, userId: string): Promise<number> {
  if (!sql) return demoInboxNotifications.filter((item) =>
    item.workspaceId === workspaceId && item.userId === userId && !item.readAt
  ).length;
  const rows = await sql`
    select count(*)::int count from inbox_notifications
    where workspace_id=${workspaceId} and user_id=${userId} and read_at is null
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function markNotificationRead(id: string, workspaceId: string, userId: string): Promise<boolean> {
  if (!sql) {
    const item = demoInboxNotifications.find((notification) => notification.id === id &&
      notification.workspaceId === workspaceId && notification.userId === userId);
    if (item) item.readAt = new Date().toISOString();
    return Boolean(item);
  }
  const rows = await sql`
    update inbox_notifications set read_at=coalesce(read_at,now())
    where id=${id} and workspace_id=${workspaceId} and user_id=${userId} returning id
  `;
  return rows.length > 0;
}

function normalizeDeliveryStatus(status: string): ConversationMessageDelivery {
  const value = status.toLowerCase();
  if (value === "received") return "received";
  if (["accepted", "scheduled", "queued", "sending"].includes(value)) return "queued";
  if (value === "sent") return "sent";
  if (value === "delivered") return "delivered";
  if (value === "read") return "read";
  if (["failed", "undelivered", "canceled", "cancelled"].includes(value)) return "failed";
  return "pending";
}

export async function updateConversationMessageDelivery(input: {
  messageId: string;
  providerMessageSid?: string;
  status: string;
  error?: string;
}): Promise<{ workspaceId: string; conversationId: string; message: ConversationMessage } | null> {
  if (!sql) return null;
  const next = normalizeDeliveryStatus(input.status);
  return sql.begin(async (tx) => {
    const rows = await tx`
      select * from conversation_messages where id=${input.messageId}
        and (${input.providerMessageSid ?? null}::text is null or provider_message_sid is null
          or provider_message_sid=${input.providerMessageSid ?? null})
      for update
    `;
    if (!rows.length) return null;
    const current = rows[0].delivery_status as ConversationMessageDelivery;
    const allowed: Record<ConversationMessageDelivery, ConversationMessageDelivery[]> = {
      received: [],
      pending: ["queued", "sent", "delivered", "read", "failed"],
      queued: ["sent", "delivered", "read", "failed"],
      sent: ["delivered", "read", "failed"],
      delivered: ["read"],
      read: [],
      failed: [],
    };
    const status = current === next || allowed[current].includes(next) ? next : current;
    const updated = await tx`
      update conversation_messages set
        provider_message_sid=coalesce(provider_message_sid,${input.providerMessageSid ?? null}),
        delivery_status=${status},
        delivery_error=case when ${status}='failed' then ${input.error ?? "Delivery failed"} else delivery_error end,
        updated_at=now()
      where id=${input.messageId} returning *
    `;
    const message = rowToConversationMessage(updated[0]);
    if (status === "failed") {
      await tx`
        update conversations set priority=case when priority='urgent' then 'urgent' else 'high' end,
          updated_at=now()
        where id=${message.conversationId} and workspace_id=${message.workspaceId}
      `;
      await tx`
        insert into inbox_notifications
          (id,workspace_id,user_id,conversation_id,type,title,body,dedupe_key)
        select 'ntf_' || gen_random_uuid()::text,${message.workspaceId},u.id,
          ${message.conversationId},'delivery_failed','A customer reply failed to send',
          ${input.error?.slice(0, 240) || "Open the Team Inbox to retry or contact the customer another way."},
          ${`delivery:${message.id}:failed`}
        from users u
        join conversations c on c.id=${message.conversationId} and c.workspace_id=u.workspace_id
        where u.workspace_id=${message.workspaceId} and u.status='active'
          and u.role in ('Owner','Admin','Agent')
          and (c.assigned_user_id is null or u.id=c.assigned_user_id)
        on conflict do nothing
      `;
    }
    return { workspaceId: message.workspaceId, conversationId: message.conversationId, message };
  });
}

export async function updateConversationMessageDeliveryByProviderSid(input: {
  workspaceId: string;
  providerMessageSid: string;
  status: string;
  error?: string;
}): Promise<{ workspaceId: string; conversationId: string; message: ConversationMessage } | null> {
  if (!sql) return null;
  const rows = await sql`
    select id from conversation_messages where workspace_id=${input.workspaceId}
      and provider_message_sid=${input.providerMessageSid} limit 1
  `;
  return rows[0] ? updateConversationMessageDelivery({
    messageId: String(rows[0].id), providerMessageSid: input.providerMessageSid,
    status: input.status, error: input.error,
  }) : null;
}

export async function claimWebhookEvent(id: string, provider: string): Promise<{
  claimed: boolean; responseText?: string;
}> {
  if (!sql) return { claimed: true };
  try {
    const rows = await sql`
      insert into webhook_events(id,provider) values(${id},${provider})
      on conflict(id) do update set claimed_at=now()
        where webhook_events.completed_at is null
          and webhook_events.claimed_at < now() - interval '10 minutes'
      returning response_text
    `;
    if (rows.length) return { claimed: true };
    const existing = await sql`select response_text from webhook_events where id=${id} limit 1`;
    return { claimed: false, responseText: (existing[0]?.response_text as string) || undefined };
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return { claimed: true };
    throw error;
  }
}

export async function completeWebhookEvent(id: string, responseText?: string) {
  if (!sql) return;
  try {
    await sql`update webhook_events set response_text=${responseText ?? null},completed_at=now() where id=${id}`;
  } catch (error) {
    if ((error as { code?: string }).code !== "42P01") throw error;
  }
}

export async function releaseWebhookEvent(id: string) {
  if (!sql) return;
  try {
    await sql`delete from webhook_events where id=${id} and completed_at is null`;
  } catch (error) {
    if ((error as { code?: string }).code !== "42P01") throw error;
  }
}

export { isDbEnabled };

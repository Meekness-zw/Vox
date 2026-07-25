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
} from "@/lib/types";

const demoBotRequests: BotRequest[] = [];
const demoBusinessDocuments: BusinessDocument[] = [];
const demoDocumentTemplates = new Map<string, DocumentTemplate>();

/* ---- row mappers ---------------------------------------------------------- */

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

/**
 * Resolve which workspace + agent should answer a call/message to `number` on
 * `channel`. In demo mode (no DB), every number routes to the demo workspace's
 * first matching agent, so voice/WhatsApp/chat all work with zero config.
 */
export async function getRoutingForNumber(
  number: string,
  channel: "voice" | "whatsapp"
): Promise<NumberRoute | null> {
  if (!sql) {
    const agentType = channel === "voice" ? "voice" : "chat";
    const agent =
      mockAgents.find((a) => a.type === agentType && a.status === "active") ??
      mockAgents[0];
    return agent ? { workspaceId: "ws_demo", agentId: agent.id } : null;
  }
  const rows = await sql`
    select workspace_id, agent_id from phone_numbers
    where number = ${number} and channel = ${channel} limit 1
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
  await sql`
    insert into phone_numbers (id, workspace_id, number, channel, agent_id)
    values (${entry.id}, ${workspaceId}, ${entry.number}, ${entry.channel}, ${entry.agentId})
    on conflict (number, channel) do update set
      agent_id = excluded.agent_id, workspace_id = excluded.workspace_id
  `;
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
      contact_email, status, admin_notes, agent_id, created_at, updated_at)
    values (${request.id}, ${request.workspaceId}, ${request.businessName}, ${request.industry},
      ${request.description}, ${request.services}, ${request.businessHours}, ${request.languages},
      ${request.tone}, ${request.escalation}, ${sql.json(request.channels)}, ${request.contactName},
      ${request.contactEmail}, ${request.status}, ${request.adminNotes}, ${request.agentId ?? null},
      ${request.createdAt}, ${request.updatedAt})
  `;
}

export async function listBotRequests(workspaceId?: string): Promise<BotRequest[]> {
  if (!sql) return workspaceId ? demoBotRequests.filter((r) => r.workspaceId === workspaceId) : demoBotRequests;
  const rows = workspaceId
    ? await sql`select * from bot_requests where workspace_id = ${workspaceId} order by created_at desc`
    : await sql`select * from bot_requests order by created_at desc`;
  return rows.map(rowToBotRequest);
}

export async function getBotRequest(id: string, workspaceId?: string): Promise<BotRequest | undefined> {
  if (!sql) return demoBotRequests.find((r) => r.id === id && (!workspaceId || r.workspaceId === workspaceId));
  const rows = workspaceId
    ? await sql`select * from bot_requests where id = ${id} and workspace_id = ${workspaceId} limit 1`
    : await sql`select * from bot_requests where id = ${id} limit 1`;
  return rows.length ? rowToBotRequest(rows[0]) : undefined;
}

export async function updateBotRequest(input: {
  id: string;
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
      admin_notes = ${input.adminNotes ?? ""}, agent_id = ${input.agentId ?? null},
      updated_at = ${now} where id = ${input.id}
  `;
}

/* ---- platform admin: bot fleet & billing -------------------------------- */

export async function listAdminBots(): Promise<AdminBotRecord[]> {
  if (!sql) {
    return mockAgents.map((agent) => ({
      id: agent.id,
      workspaceId: "ws_demo",
      workspaceName: "Bright Smile Dental",
      clientEmail: "demo@vox.ai",
      name: agent.name,
      type: agent.type,
      status: agent.status,
      billingStatus: "trial" as const,
      priceCents: 29900,
      conversations: mockConversations.filter((c) => c.agentId === agent.id).length,
      appointments: mockAppointments.filter((a) => a.agentId === agent.id).length,
      createdAt: agent.createdAt,
    }));
  }
  const rows = await sql`
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
  if (!sql) return;
  await sql`
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
  if (!sql) {
    const agent = mockAgents.find((item) => item.id === input.agentId);
    if (agent) agent.status = input.status;
    return;
  }
  await sql`
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
}> {
  if (!sql) return { plan: workspaceId === "ws_demo" ? "growth" : "free", status: workspaceId === "ws_demo" ? "active" : "free" };
  const rows = await sql`select plan, subscription_status, subscription_due_at from workspaces where id = ${workspaceId} limit 1`;
  if (!rows.length) return { plan: "free", status: "free" };
  return {
    plan: rows[0].plan as string,
    status: rows[0].subscription_status as SubscriptionStatus,
    dueAt: rows[0].subscription_due_at ? new Date(rows[0].subscription_due_at as string).toISOString() : undefined,
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
  if (!sql) return;
  await sql`
    update workspaces set plan = ${input.plan}, subscription_status = ${input.status},
      subscription_due_at = ${input.dueAt || null},
      stripe_customer_id = coalesce(${input.stripeCustomerId || null}, stripe_customer_id),
      stripe_subscription_id = coalesce(${input.stripeSubscriptionId || null}, stripe_subscription_id)
    where id = ${input.workspaceId}
  `;
}

export async function findWorkspaceByStripeSubscription(subscriptionId: string): Promise<string | undefined> {
  if (!sql) return undefined;
  const rows = await sql`select id from workspaces where stripe_subscription_id = ${subscriptionId} limit 1`;
  return rows.length ? rows[0].id as string : undefined;
}

export async function listAdminClients(): Promise<AdminClientRecord[]> {
  if (!sql) return [{ workspaceId: "ws_demo", workspaceName: "Bright Smile Dental", plan: "growth", subscriptionStatus: "active", ownerName: "Demo User", ownerEmail: "demo@vox.ai", users: 1, bots: mockAgents.length, createdAt: new Date().toISOString() }];
  const rows = await sql`
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
      business_hours, languages, tone, escalation, updated_at)
    values (${profile.workspaceId}, ${profile.businessName}, ${profile.industry}, ${profile.description},
      ${profile.services}, ${profile.businessHours}, ${profile.languages}, ${profile.tone},
      ${profile.escalation}, ${profile.updatedAt})
    on conflict (workspace_id) do update set business_name = excluded.business_name,
      industry = excluded.industry, description = excluded.description, services = excluded.services,
      business_hours = excluded.business_hours, languages = excluded.languages, tone = excluded.tone,
      escalation = excluded.escalation, updated_at = excluded.updated_at
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

/* ---- users & workspaces --------------------------------------------------- */

export type DbUser = {
  id: string;
  workspaceId: string;
  email: string;
  passwordHash: string;
  name: string;
  role: string;
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
  };
}

export async function createWorkspaceWithOwner(opts: {
  workspaceName: string;
  email: string;
  name: string;
  passwordHash: string;
}): Promise<DbUser> {
  if (!sql) throw new Error("DATABASE_URL is not set");
  const wsId = "ws_" + Math.random().toString(36).slice(2, 10);
  const userId = "u_" + Math.random().toString(36).slice(2, 10);
  await sql`insert into workspaces (id, name) values (${wsId}, ${opts.workspaceName})`;
  await sql`
    insert into users (id, workspace_id, email, password_hash, name, role)
    values (${userId}, ${wsId}, ${opts.email.toLowerCase()}, ${opts.passwordHash}, ${opts.name}, 'Owner')
  `;
  return {
    id: userId,
    workspaceId: wsId,
    email: opts.email.toLowerCase(),
    passwordHash: opts.passwordHash,
    name: opts.name,
    role: "Owner",
  };
}

export async function getWorkspaceName(workspaceId = "ws_demo"): Promise<string> {
  if (!sql) return "Bright Smile Dental";
  const rows = await sql`select name from workspaces where id = ${workspaceId} limit 1`;
  return rows.length ? (rows[0].name as string) : "Your Business";
}

export { isDbEnabled };

import { sql, isDbEnabled } from "@/lib/db";
import {
  agents as mockAgents,
  conversations as mockConversations,
  knowledgeSources as mockKnowledgeSources,
} from "@/lib/data";
import type { Agent, Conversation, KnowledgeSource } from "@/lib/types";

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

/* ---- writes --------------------------------------------------------------- */

export async function upsertAgent(
  a: Agent,
  workspaceId = "ws_demo"
): Promise<void> {
  if (!sql) return; // demo mode: no-op
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

export { isDbEnabled };

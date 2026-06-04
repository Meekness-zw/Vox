import postgres from "postgres";

/**
 * Postgres connection. Set DATABASE_URL (e.g. a Neon connection string from the
 * Vercel Marketplace) to enable. When it's unset the whole app transparently
 * falls back to in-memory demo data, so local dev needs zero setup.
 */
const connectionString = process.env.DATABASE_URL;

declare global {
  // eslint-disable-next-line no-var
  var __voxSql: ReturnType<typeof postgres> | undefined;
}

export const sql = connectionString
  ? (globalThis.__voxSql ??= postgres(connectionString, {
      ssl: "require",
      max: 5,
      idle_timeout: 20,
    }))
  : null;

export const isDbEnabled = sql !== null;

/** Idempotent schema. Safe to run on every deploy / before seeding. */
export const SCHEMA = `
create extension if not exists vector;

create table if not exists workspaces (
  id text primary key,
  name text not null,
  plan text not null default 'growth',
  created_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  workspace_id text not null,
  email text unique not null,
  password_hash text not null,
  name text not null,
  role text not null default 'Owner',
  created_at timestamptz not null default now()
);

create table if not exists agents (
  id text primary key,
  workspace_id text not null default 'ws_demo',
  name text not null,
  type text not null,
  status text not null,
  language text not null,
  voice text,
  personality text not null,
  system_prompt text not null,
  greeting text not null,
  business_hours text not null,
  escalation text not null,
  created_at timestamptz not null default now()
);
alter table agents add column if not exists workspace_id text not null default 'ws_demo';

create table if not exists conversations (
  id text primary key,
  workspace_id text not null default 'ws_demo',
  agent_id text not null,
  channel text not null,
  contact text not null,
  started_at timestamptz not null,
  duration_sec integer not null default 0,
  sentiment text not null,
  outcome text not null,
  summary text not null,
  action_items jsonb not null default '[]'::jsonb,
  transcript jsonb not null default '[]'::jsonb
);
alter table conversations add column if not exists workspace_id text not null default 'ws_demo';

create index if not exists conversations_agent_idx on conversations (agent_id);
create index if not exists conversations_started_idx on conversations (started_at desc);
create index if not exists conversations_ws_idx on conversations (workspace_id);

create table if not exists knowledge_sources (
  id text primary key,
  workspace_id text not null default 'ws_demo',
  name text not null,
  type text not null,
  status text not null default 'synced',
  chunks integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_chunks (
  id text primary key,
  source_id text not null,
  workspace_id text not null default 'ws_demo',
  content text not null,
  embedding vector(1536),
  tsv tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now()
);
create index if not exists knowledge_chunks_source_idx on knowledge_chunks (source_id);
create index if not exists knowledge_chunks_ws_idx on knowledge_chunks (workspace_id);
create index if not exists knowledge_chunks_tsv_idx on knowledge_chunks using gin (tsv);
create index if not exists knowledge_chunks_vec_idx on knowledge_chunks using hnsw (embedding vector_cosine_ops);
`;

export async function initSchema() {
  if (!sql) throw new Error("DATABASE_URL is not set");
  await sql.unsafe(SCHEMA);
}

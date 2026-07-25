import postgres from "postgres";

/**
 * Postgres connection. Set DATABASE_URL (e.g. a Neon connection string from the
 * Vercel Marketplace) to enable. When it's unset the whole app transparently
 * falls back to in-memory demo data, so local dev needs zero setup.
 */
const connectionString = process.env.DATABASE_URL;

declare global {
  var __voxSql: ReturnType<typeof postgres> | undefined;
}

export const sql = connectionString
  ? (globalThis.__voxSql ??= postgres(connectionString, {
      ssl: "require",
      max: 5,
      idle_timeout: 20,
      // Supabase's transaction-mode Supavisor pooler (port 6543) does not
      // support prepared statements. Disabling them also works with direct
      // and session-mode connections, so one DATABASE_URL works everywhere.
      prepare: false,
    }))
  : null;

export const isDbEnabled = sql !== null;

/** Idempotent schema. Safe to run on every deploy / before seeding. */
export const SCHEMA = `
create extension if not exists vector;

create table if not exists workspaces (
  id text primary key,
  name text not null,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);
alter table workspaces add column if not exists subscription_status text not null default 'free';
alter table workspaces add column if not exists subscription_due_at timestamptz;
alter table workspaces add column if not exists stripe_customer_id text;
alter table workspaces add column if not exists stripe_subscription_id text;
alter table workspaces alter column plan set default 'free';

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
alter table agents add column if not exists billing_status text not null default 'unpaid';
alter table agents add column if not exists price_cents integer not null default 0;
alter table agents add column if not exists paid_through timestamptz;

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

-- Maps a Twilio number (voice or WhatsApp) to the workspace + default agent
-- that should answer it, so a business's own number always reaches its own
-- agent/knowledge base/calendar/invoices instead of a shared demo workspace.
create table if not exists phone_numbers (
  id text primary key,
  workspace_id text not null,
  number text not null,
  channel text not null,
  agent_id text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists phone_numbers_number_channel_idx on phone_numbers (number, channel);
create index if not exists phone_numbers_ws_idx on phone_numbers (workspace_id);

create table if not exists calendar_connections (
  workspace_id text primary key,
  provider text not null default 'google',
  calendar_id text not null default 'primary',
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  timezone text not null default 'Africa/Harare',
  connected_at timestamptz not null default now()
);

create table if not exists appointments (
  id text primary key,
  workspace_id text not null default 'ws_demo',
  agent_id text not null,
  conversation_id text,
  contact_name text not null,
  contact_phone text,
  contact_email text,
  service text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed',
  google_event_id text,
  created_at timestamptz not null default now()
);
create index if not exists appointments_ws_idx on appointments (workspace_id);
create index if not exists appointments_starts_idx on appointments (starts_at);

create table if not exists client_invoices (
  id text primary key,
  workspace_id text not null default 'ws_demo',
  agent_id text,
  conversation_id text,
  contact_name text not null,
  contact_email text not null,
  line_items jsonb not null default '[]'::jsonb,
  subtotal_cents integer not null default 0,
  total_cents integer not null default 0,
  status text not null default 'sent',
  notes text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists client_invoices_ws_idx on client_invoices (workspace_id);

-- Reusable business documents. The JSON line-items/content fields let Vox add
-- new document types without a schema migration while every row remains
-- tenant-scoped and auditable.
create table if not exists document_templates (
  workspace_id text primary key,
  business_name text not null default '',
  logo_url text,
  primary_color text not null default '#6D5DFB',
  accent_color text not null default '#111827',
  currency text not null default 'USD',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  tax_number text not null default '',
  footer text not null default 'Thank you for your business.',
  payment_terms text not null default 'Payment due on receipt.',
  updated_at timestamptz not null default now()
);

create table if not exists business_documents (
  id text primary key,
  workspace_id text not null,
  agent_id text,
  conversation_id text,
  type text not null,
  number text not null,
  status text not null default 'draft',
  contact_name text not null,
  contact_email text,
  contact_phone text,
  contact_address text,
  line_items jsonb not null default '[]'::jsonb,
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  currency text not null default 'USD',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  issue_date date not null default current_date,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists business_documents_ws_number_idx
  on business_documents (workspace_id, number);
create index if not exists business_documents_ws_created_idx
  on business_documents (workspace_id, created_at desc);
create index if not exists business_documents_conversation_idx
  on business_documents (conversation_id);

create table if not exists bot_requests (
  id text primary key,
  workspace_id text not null,
  business_name text not null,
  industry text not null,
  description text not null,
  services text not null,
  business_hours text not null,
  languages text not null,
  tone text not null,
  escalation text not null,
  channels jsonb not null default '[]'::jsonb,
  contact_name text not null,
  contact_email text not null,
  status text not null default 'submitted',
  admin_notes text not null default '',
  agent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bot_requests_ws_idx on bot_requests (workspace_id);
create index if not exists bot_requests_status_idx on bot_requests (status, created_at desc);

create table if not exists company_profiles (
  workspace_id text primary key,
  business_name text not null,
  industry text not null,
  description text not null,
  services text not null,
  business_hours text not null,
  languages text not null,
  tone text not null,
  escalation text not null,
  updated_at timestamptz not null default now()
);

create table if not exists team_invitations (
  id text primary key,
  workspace_id text not null,
  email text not null,
  role text not null default 'Agent',
  token_hash text unique not null,
  invited_by text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists team_invitations_ws_idx on team_invitations (workspace_id, created_at desc);

create table if not exists widget_configs (
  workspace_id text primary key,
  public_token text unique not null,
  agent_id text not null,
  title text not null default 'Chat with us',
  welcome_message text not null default 'Hi! How can I help?',
  primary_color text not null default '#6D5DFB',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists crm_connections (
  workspace_id text primary key,
  name text not null default 'CRM webhook',
  webhook_url text not null,
  secret_encrypted text,
  enabled boolean not null default true,
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists audit_events (
  id text primary key,
  workspace_id text not null,
  actor_email text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_ws_idx on audit_events (workspace_id, created_at desc);

-- Supabase exposes tables in the public schema through its Data API. Vox uses
-- a trusted server-side PostgreSQL connection and its own workspace checks, so
-- RLS is enabled without public policies: anon/authenticated Data API callers
-- get no table access while the database owner used by the backend can operate.
alter table workspaces enable row level security;
alter table users enable row level security;
alter table agents enable row level security;
alter table conversations enable row level security;
alter table knowledge_sources enable row level security;
alter table knowledge_chunks enable row level security;
alter table phone_numbers enable row level security;
alter table calendar_connections enable row level security;
alter table appointments enable row level security;
alter table client_invoices enable row level security;
alter table document_templates enable row level security;
alter table business_documents enable row level security;
alter table bot_requests enable row level security;
alter table company_profiles enable row level security;
alter table team_invitations enable row level security;
alter table widget_configs enable row level security;
alter table crm_connections enable row level security;
alter table audit_events enable row level security;
`;

export async function initSchema() {
  if (!sql) throw new Error("DATABASE_URL is not set");
  await sql.unsafe(SCHEMA);
}

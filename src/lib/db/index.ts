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
alter table users add column if not exists status text not null default 'active';

create table if not exists sms_messages (
  id text primary key,
  workspace_id text not null,
  to_number text not null,
  from_number text not null,
  body text not null,
  status text not null default 'queued',
  twilio_sid text,
  error_message text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sms_messages_ws_idx on sms_messages (workspace_id, created_at desc);

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
alter table conversations add column if not exists inbox_status text not null default 'ai_active';
alter table conversations add column if not exists bot_mode text not null default 'active';
alter table conversations add column if not exists priority text not null default 'normal';
alter table conversations add column if not exists assigned_user_id text;
alter table conversations add column if not exists assigned_at timestamptz;
alter table conversations add column if not exists handoff_reason text;
alter table conversations add column if not exists handoff_requested_at timestamptz;
alter table conversations add column if not exists human_first_response_at timestamptz;
alter table conversations add column if not exists resolved_at timestamptz;
alter table conversations add column if not exists business_address text;
alter table conversations add column if not exists last_message_at timestamptz;
alter table conversations add column if not exists last_message_preview text not null default '';
alter table conversations add column if not exists state_version bigint not null default 0;
alter table conversations add column if not exists updated_at timestamptz not null default now();
update conversations set last_message_at=started_at where last_message_at is null;
alter table conversations alter column last_message_at set default now();
alter table conversations alter column last_message_at set not null;

create index if not exists conversations_agent_idx on conversations (agent_id);
create index if not exists conversations_started_idx on conversations (started_at desc);
create index if not exists conversations_ws_idx on conversations (workspace_id);
create index if not exists conversations_inbox_idx
  on conversations (workspace_id, inbox_status, priority, last_message_at desc);
create index if not exists conversations_assignee_idx
  on conversations (workspace_id, assigned_user_id, inbox_status, last_message_at desc);

-- Message bodies are immutable timeline records. Delivery columns may advance
-- as the provider reports queued/sent/delivered/read/failed states.
create table if not exists conversation_messages (
  id text primary key,
  sequence_no bigint generated always as identity,
  workspace_id text not null,
  conversation_id text not null,
  channel text not null,
  direction text not null,
  author_type text not null,
  author_user_id text,
  author_name text,
  body text not null,
  delivery_status text not null default 'received',
  provider_message_sid text,
  idempotency_key text,
  delivery_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists conversation_messages_provider_sid_idx
  on conversation_messages (workspace_id, provider_message_sid)
  where provider_message_sid is not null;
create unique index if not exists conversation_messages_idempotency_idx
  on conversation_messages (workspace_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists conversation_messages_thread_idx
  on conversation_messages (workspace_id, conversation_id, sequence_no);

-- One-time/idempotent bridge for conversations recorded before the normalized
-- timeline existed. New channel code appends directly to conversation_messages.
insert into conversation_messages
  (id,workspace_id,conversation_id,channel,direction,author_type,body,delivery_status,created_at,updated_at)
select 'legacy_' || md5(c.id || ':' || item.ordinality::text),c.workspace_id,c.id,c.channel,
  case when item.value->>'role'='caller' then 'inbound' else 'outbound' end,
  case when item.value->>'role'='caller' then 'customer' else 'bot' end,
  item.value->>'text',
  case when item.value->>'role'='caller' then 'received' else 'delivered' end,
  c.started_at + ((item.ordinality - 1) * interval '1 millisecond'),
  c.started_at + ((item.ordinality - 1) * interval '1 millisecond')
from conversations c
cross join lateral jsonb_array_elements(c.transcript) with ordinality as item(value,ordinality)
where jsonb_typeof(c.transcript)='array' and btrim(coalesce(item.value->>'text',''))<>''
on conflict do nothing;
update conversations c set
  last_message_at=coalesce((select m.created_at from conversation_messages m
    where m.workspace_id=c.workspace_id and m.conversation_id=c.id
    order by m.sequence_no desc limit 1),c.last_message_at),
  last_message_preview=coalesce((select left(m.body,240) from conversation_messages m
    where m.workspace_id=c.workspace_id and m.conversation_id=c.id
    order by m.sequence_no desc limit 1),c.last_message_preview)
where c.last_message_preview='';

-- Notes are deliberately separate from customer-visible messages so no
-- widget/provider endpoint can accidentally disclose internal discussion.
create table if not exists conversation_notes (
  id text primary key,
  workspace_id text not null,
  conversation_id text not null,
  author_user_id text not null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists conversation_notes_thread_idx
  on conversation_notes (workspace_id, conversation_id, created_at);

-- Read position is per team member. Reading a thread must not clear another
-- team member's unread state.
create table if not exists conversation_reads (
  workspace_id text not null,
  conversation_id text not null,
  user_id text not null,
  last_read_sequence bigint not null default 0,
  read_at timestamptz not null default now(),
  primary key (workspace_id, conversation_id, user_id)
);
create index if not exists conversation_reads_user_idx
  on conversation_reads (workspace_id, user_id, read_at desc);

create table if not exists inbox_notifications (
  id text primary key,
  workspace_id text not null,
  user_id text not null,
  conversation_id text,
  type text not null,
  title text not null,
  body text not null,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists inbox_notifications_dedupe_idx
  on inbox_notifications (workspace_id, user_id, dedupe_key)
  where dedupe_key is not null;
create index if not exists inbox_notifications_user_idx
  on inbox_notifications (workspace_id, user_id, read_at, created_at desc);

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

create table if not exists voice_call_sessions (
  call_sid text primary key,
  workspace_id text not null,
  agent_id text not null,
  caller text not null,
  messages jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- Double-entry bookkeeping. Monetary values are stored in integer minor units.
create table if not exists accounting_settings (
  workspace_id text primary key,
  base_currency text not null default 'USD',
  updated_at timestamptz not null default now()
);

create table if not exists accounting_accounts (
  id text primary key,
  workspace_id text not null,
  code text not null,
  name text not null,
  type text not null,
  system_key text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workspace_id, code),
  unique (workspace_id, system_key)
);
create unique index if not exists accounting_accounts_id_ws_unique
  on accounting_accounts (id, workspace_id);

create table if not exists journal_entries (
  id text primary key,
  workspace_id text not null,
  entry_date date not null,
  description text not null,
  reference text,
  direction text not null default 'journal',
  currency text not null default 'USD',
  status text not null default 'posted',
  source_type text not null default 'manual',
  source_id text,
  created_by text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists journal_entries_id_ws_unique
  on journal_entries (id, workspace_id);
create unique index if not exists journal_entries_source_unique
  on journal_entries (workspace_id, source_type, source_id) where source_id is not null;
create index if not exists journal_entries_ws_date_idx
  on journal_entries (workspace_id, entry_date desc, created_at desc);

create table if not exists journal_lines (
  id text primary key,
  workspace_id text not null,
  entry_id text not null,
  account_id text not null,
  memo text,
  debit_cents bigint not null default 0,
  credit_cents bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists journal_lines_ws_entry_idx
  on journal_lines (workspace_id, entry_id);
create index if not exists journal_lines_ws_account_idx
  on journal_lines (workspace_id, account_id);

create table if not exists business_analyses (
  id text primary key,
  workspace_id text not null,
  kind text not null,
  title text not null,
  query text not null,
  report text not null,
  sources jsonb not null default '[]'::jsonb,
  model text,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists business_analyses_ws_created_idx
  on business_analyses (workspace_id, created_at desc);

-- Atomic per-workspace usage guard for paid web research calls.
create table if not exists business_research_usage (
  workspace_id text primary key,
  usage_date date not null default current_date,
  request_count integer not null default 0,
  last_started_at timestamptz not null default now()
);

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
alter table bot_requests add column if not exists company_phone text;
alter table bot_requests add column if not exists routing_phone text;
alter table bot_requests add column if not exists transfer_phone text;
alter table bot_requests add column if not exists whatsapp_phone text;
alter table bot_requests add column if not exists whatsapp_sender_sid text;
alter table bot_requests add column if not exists whatsapp_sender_status text;
alter table bot_requests add column if not exists timezone text not null default 'Africa/Harare';
alter table bot_requests add column if not exists business_schedule jsonb not null default '[]'::jsonb;

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
alter table company_profiles add column if not exists company_phone text;
alter table company_profiles add column if not exists routing_phone text;
alter table company_profiles add column if not exists transfer_phone text;
alter table company_profiles add column if not exists whatsapp_phone text;
alter table company_profiles add column if not exists timezone text not null default 'Africa/Harare';
alter table company_profiles add column if not exists business_schedule jsonb not null default '[]'::jsonb;

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
alter table team_invitations add column if not exists revoked_at timestamptz;
create index if not exists team_invitations_ws_idx on team_invitations (workspace_id, created_at desc);

create table if not exists widget_configs (
  workspace_id text primary key,
  public_token text unique not null,
  agent_id text not null,
  title text not null default 'Chat with us',
  welcome_message text not null default 'Hi! How can I help?',
  primary_color text not null default '#0F766E',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table widget_configs add column if not exists allowed_domains jsonb not null default '[]'::jsonb;

create table if not exists widget_rate_limits (
  bucket text primary key,
  request_count integer not null default 1,
  expires_at timestamptz not null
);
create index if not exists widget_rate_limits_expiry_idx on widget_rate_limits (expires_at);

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

create table if not exists crm_deliveries (
  id text primary key,
  workspace_id text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  response_status integer,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_deliveries_ws_idx on crm_deliveries (workspace_id, created_at desc);

create table if not exists audit_events (
  id text primary key,
  workspace_id text not null,
  actor_email text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_ws_idx on audit_events (workspace_id, created_at desc);

create table if not exists webhook_events (
  id text primary key,
  provider text not null,
  response_text text,
  claimed_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists webhook_events_claimed_idx on webhook_events (claimed_at);

-- Enforce the invariants relied on by authentication, tenant routing, and the
-- admin workflow at the database boundary as well as in application code.
do $$ begin
  alter table users add constraint users_status_check check (status in ('active','suspended'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table users drop constraint if exists users_role_check;
  alter table users add constraint users_role_check check (role in ('Owner','Admin','Agent','Bookkeeper'));
end $$;
do $$ begin
  alter table agents add constraint agents_type_check check (type in ('voice','chat'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table agents add constraint agents_status_check check (status in ('active','draft','paused'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversations add constraint conversations_channel_check check (channel in ('voice','chat','sms','whatsapp'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversations add constraint conversations_inbox_status_check check (inbox_status in ('ai_active','needs_human','human_active','resolved'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversations add constraint conversations_bot_mode_check check (bot_mode in ('active','paused'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversations add constraint conversations_priority_check check (priority in ('low','normal','high','urgent'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversations add constraint conversations_automation_state_check check (
    (inbox_status='ai_active' and bot_mode='active') or
    (inbox_status in ('needs_human','human_active') and bot_mode='paused') or
    inbox_status='resolved'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversations add constraint conversations_state_version_check check (state_version >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversation_messages add constraint conversation_messages_channel_check check (channel in ('voice','chat','sms','whatsapp'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversation_messages add constraint conversation_messages_direction_check check (direction in ('inbound','outbound','internal'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversation_messages add constraint conversation_messages_author_check check (author_type in ('customer','bot','human','system'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversation_messages add constraint conversation_messages_delivery_check check (delivery_status in ('received','pending','queued','sent','delivered','read','failed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversation_messages add constraint conversation_messages_body_check check (char_length(btrim(body)) between 1 and 10000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversation_messages add constraint conversation_messages_human_author_check check (
    (author_type='human' and author_user_id is not null) or
    (author_type<>'human' and author_user_id is null)
  );
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversation_notes add constraint conversation_notes_body_check check (char_length(btrim(body)) between 1 and 10000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversation_reads add constraint conversation_reads_sequence_check check (last_read_sequence >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table phone_numbers add constraint phone_numbers_channel_check check (channel in ('voice','whatsapp'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table appointments add constraint appointments_status_check check (status in ('confirmed','cancelled','completed','no_show'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table bot_requests add constraint bot_requests_status_check check (status in ('payment_required','submitted','under_review','building','testing','changes_requested','approved','live'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table workspaces add constraint workspaces_subscription_status_check check (subscription_status in ('free','active','past_due','cancelled'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table accounting_accounts add constraint accounting_accounts_type_check check (type in ('asset','liability','equity','revenue','expense'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table accounting_settings add constraint accounting_settings_currency_check check (base_currency ~ '^[A-Z]{3}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table journal_entries add constraint journal_entries_status_check check (status in ('posted','reversed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table journal_entries add constraint journal_entries_direction_check check (direction in ('income','expense','journal'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table journal_lines add constraint journal_lines_amount_check check (
    debit_cents >= 0 and credit_cents >= 0 and
    ((debit_cents > 0 and credit_cents = 0) or (credit_cents > 0 and debit_cents = 0))
  );
exception when duplicate_object then null; end $$;
do $$ begin
  alter table business_analyses add constraint business_analyses_kind_check check (kind in ('swot','sales_research'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table business_research_usage add constraint business_research_usage_count_check check (request_count >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table users add constraint users_workspace_fk foreign key (workspace_id) references workspaces(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table agents add constraint agents_workspace_fk foreign key (workspace_id) references workspaces(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversations add constraint conversations_workspace_fk foreign key (workspace_id) references workspaces(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table phone_numbers add constraint phone_numbers_workspace_fk foreign key (workspace_id) references workspaces(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table appointments add constraint appointments_workspace_fk foreign key (workspace_id) references workspaces(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table bot_requests add constraint bot_requests_workspace_fk foreign key (workspace_id) references workspaces(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table company_profiles add constraint company_profiles_workspace_fk foreign key (workspace_id) references workspaces(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ declare table_name text; begin
  foreach table_name in array array[
    'sms_messages','knowledge_sources','knowledge_chunks','calendar_connections',
    'voice_call_sessions','client_invoices','document_templates','business_documents',
    'team_invitations','widget_configs','crm_connections','crm_deliveries','audit_events',
    'accounting_settings','accounting_accounts','journal_entries','journal_lines','business_analyses',
    'business_research_usage','conversation_messages','conversation_notes','conversation_reads',
    'inbox_notifications'
  ] loop
    begin
      execute format(
        'alter table %I add constraint %I foreign key (workspace_id) references workspaces(id) on delete cascade',
        table_name, table_name || '_workspace_fk'
      );
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
do $$ begin
  alter table users add constraint users_id_workspace_unique unique (id,workspace_id);
exception when duplicate_object or duplicate_table then null; end $$;
do $$ begin
  alter table conversations add constraint conversations_id_workspace_unique unique (id,workspace_id);
exception when duplicate_object or duplicate_table then null; end $$;
do $$ begin
  alter table conversations add constraint conversations_assigned_user_workspace_fk
    foreign key (assigned_user_id,workspace_id) references users(id,workspace_id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversation_messages add constraint conversation_messages_conversation_workspace_fk
    foreign key (conversation_id,workspace_id) references conversations(id,workspace_id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversation_messages add constraint conversation_messages_author_user_workspace_fk
    foreign key (author_user_id,workspace_id) references users(id,workspace_id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversation_notes add constraint conversation_notes_conversation_workspace_fk
    foreign key (conversation_id,workspace_id) references conversations(id,workspace_id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversation_notes add constraint conversation_notes_author_user_workspace_fk
    foreign key (author_user_id,workspace_id) references users(id,workspace_id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversation_reads add constraint conversation_reads_conversation_workspace_fk
    foreign key (conversation_id,workspace_id) references conversations(id,workspace_id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table conversation_reads add constraint conversation_reads_user_workspace_fk
    foreign key (user_id,workspace_id) references users(id,workspace_id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table inbox_notifications add constraint inbox_notifications_user_workspace_fk
    foreign key (user_id,workspace_id) references users(id,workspace_id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table inbox_notifications add constraint inbox_notifications_conversation_workspace_fk
    foreign key (conversation_id,workspace_id) references conversations(id,workspace_id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table journal_lines add constraint journal_lines_entry_workspace_fk
    foreign key (entry_id,workspace_id) references journal_entries(id,workspace_id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table journal_lines add constraint journal_lines_account_workspace_fk
    foreign key (account_id,workspace_id) references accounting_accounts(id,workspace_id);
exception when duplicate_object then null; end $$;

-- A posted journal is valid only when total debits equal total credits. The
-- deferred triggers allow the entry and all of its lines to be inserted in one
-- transaction, then enforce the invariant at commit.
create or replace function vox_check_balanced_journal() returns trigger as $$
declare
  target_entry text;
  previous_entry text;
  debit_total bigint;
  credit_total bigint;
  line_count integer;
begin
  if tg_table_name = 'journal_entries' then
    if tg_op = 'DELETE' then target_entry := old.id;
    else target_entry := new.id;
    end if;
  elsif tg_op = 'DELETE' then
    target_entry := old.entry_id;
  elsif tg_op = 'INSERT' then
    target_entry := new.entry_id;
  else
    target_entry := new.entry_id;
    if old.entry_id is distinct from new.entry_id then previous_entry := old.entry_id; end if;
  end if;

  foreach target_entry in array array_remove(array[target_entry, previous_entry], null) loop
    if exists (select 1 from journal_entries where id=target_entry and status='posted') then
      select coalesce(sum(debit_cents),0), coalesce(sum(credit_cents),0), count(*)
        into debit_total, credit_total, line_count from journal_lines where entry_id=target_entry;
      if line_count < 2 or debit_total <= 0 or debit_total <> credit_total then
        raise exception 'Journal entry % is not balanced', target_entry;
      end if;
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$ language plpgsql;
drop trigger if exists journal_entries_balance_trigger on journal_entries;
create constraint trigger journal_entries_balance_trigger
  after insert or update on journal_entries deferrable initially deferred
  for each row execute function vox_check_balanced_journal();
drop trigger if exists journal_lines_balance_trigger on journal_lines;
create constraint trigger journal_lines_balance_trigger
  after insert or update or delete on journal_lines deferrable initially deferred
  for each row execute function vox_check_balanced_journal();
do $$ begin
  alter table agents add constraint agents_id_workspace_unique unique (id,workspace_id);
exception when duplicate_object or duplicate_table then null; end $$;
do $$ declare table_name text; begin
  foreach table_name in array array['conversations','phone_numbers','appointments','client_invoices','business_documents','bot_requests'] loop
    begin
      execute format(
        'alter table %I add constraint %I foreign key (agent_id,workspace_id) references agents(id,workspace_id) on delete cascade',
        table_name, table_name || '_agent_workspace_fk'
      );
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
do $$ begin
  alter table knowledge_sources add constraint knowledge_sources_id_workspace_unique unique (id,workspace_id);
exception when duplicate_object or duplicate_table then null; end $$;
do $$ begin
  alter table knowledge_chunks add constraint knowledge_chunks_source_workspace_fk
    foreign key (source_id,workspace_id) references knowledge_sources(id,workspace_id) on delete cascade;
exception when duplicate_object then null; end $$;

-- Supabase exposes tables in the public schema through its Data API. Vox uses
-- a trusted server-side PostgreSQL connection and its own workspace checks, so
-- RLS is enabled without public policies: anon/authenticated Data API callers
-- get no table access while the database owner used by the backend can operate.
alter table workspaces enable row level security;
alter table users enable row level security;
alter table sms_messages enable row level security;
alter table agents enable row level security;
alter table conversations enable row level security;
alter table knowledge_sources enable row level security;
alter table knowledge_chunks enable row level security;
alter table phone_numbers enable row level security;
alter table calendar_connections enable row level security;
alter table appointments enable row level security;
alter table voice_call_sessions enable row level security;
alter table client_invoices enable row level security;
alter table document_templates enable row level security;
alter table business_documents enable row level security;
alter table bot_requests enable row level security;
alter table company_profiles enable row level security;
alter table team_invitations enable row level security;
alter table widget_configs enable row level security;
alter table widget_rate_limits enable row level security;
alter table crm_connections enable row level security;
alter table crm_deliveries enable row level security;
alter table audit_events enable row level security;
alter table webhook_events enable row level security;
alter table accounting_settings enable row level security;
alter table accounting_accounts enable row level security;
alter table journal_entries enable row level security;
alter table journal_lines enable row level security;
alter table business_analyses enable row level security;
alter table business_research_usage enable row level security;
alter table conversation_messages enable row level security;
alter table conversation_notes enable row level security;
alter table conversation_reads enable row level security;
alter table inbox_notifications enable row level security;
`;

export async function initSchema() {
  if (!sql) throw new Error("DATABASE_URL is not set");
  await sql.unsafe(SCHEMA);
}

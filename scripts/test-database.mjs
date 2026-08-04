import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the database integration audit.");
}

const { sql } = await import("../src/lib/db/index.ts");
try {
  const requiredTables = [
    "workspaces", "users", "sms_messages", "agents", "conversations",
    "knowledge_sources", "knowledge_chunks", "phone_numbers",
    "calendar_connections", "appointments", "voice_call_sessions",
    "client_invoices", "document_templates", "business_documents",
    "bot_requests", "company_profiles", "team_invitations", "widget_configs",
    "widget_rate_limits", "crm_connections", "crm_deliveries", "audit_events",
    "webhook_events", "accounting_settings", "accounting_accounts", "journal_entries", "journal_lines",
    "business_analyses", "business_research_usage", "conversation_messages",
    "conversation_notes", "conversation_reads", "inbox_notifications",
  ];
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema='public' and table_name = any(${requiredTables})
  `;
  assert.deepEqual(
    new Set(tables.map((row) => String(row.table_name))),
    new Set(requiredTables),
    "The production schema is incomplete."
  );

  const [integrity] = await sql.unsafe(`
    select
      (select count(*)::int from users u left join workspaces w on w.id=u.workspace_id where w.id is null) orphan_users,
      (select count(*)::int from agents a left join workspaces w on w.id=a.workspace_id where w.id is null) orphan_agents,
      (select count(*)::int from conversations c left join workspaces w on w.id=c.workspace_id where w.id is null) orphan_conversations,
      (select count(*)::int from conversations c join agents a on a.id=c.agent_id where c.workspace_id<>a.workspace_id) cross_tenant_conversations,
      (select count(*)::int from phone_numbers p join agents a on a.id=p.agent_id where p.workspace_id<>a.workspace_id) cross_tenant_routes,
      (select count(*)::int from (select number,channel from phone_numbers group by number,channel having count(*)>1) d) duplicate_routes,
      (select count(*)::int from users where status not in ('active','suspended')) invalid_user_status,
      (select count(*)::int from agents where status not in ('active','draft','paused')) invalid_agent_status,
      (select count(*)::int from sms_messages x left join workspaces w on w.id=x.workspace_id where w.id is null) orphan_sms,
      (select count(*)::int from knowledge_sources x left join workspaces w on w.id=x.workspace_id where w.id is null) orphan_knowledge_sources,
      (select count(*)::int from knowledge_chunks x left join knowledge_sources s on s.id=x.source_id and s.workspace_id=x.workspace_id where s.id is null) orphan_knowledge_chunks,
      (select count(*)::int from client_invoices x left join workspaces w on w.id=x.workspace_id where w.id is null) orphan_invoices,
      (select count(*)::int from business_documents x left join workspaces w on w.id=x.workspace_id where w.id is null) orphan_documents,
      (select count(*)::int from bot_requests x left join workspaces w on w.id=x.workspace_id where w.id is null) orphan_bot_requests,
      (select count(*)::int from company_profiles x left join workspaces w on w.id=x.workspace_id where w.id is null) orphan_profiles,
      (select count(*)::int from accounting_accounts x left join workspaces w on w.id=x.workspace_id where w.id is null) orphan_accounting_accounts,
      (select count(*)::int from journal_entries x left join workspaces w on w.id=x.workspace_id where w.id is null) orphan_journal_entries,
      (select count(*)::int from journal_lines x left join journal_entries e on e.id=x.entry_id and e.workspace_id=x.workspace_id where e.id is null) orphan_journal_lines,
      (select count(*)::int from business_analyses x left join workspaces w on w.id=x.workspace_id where w.id is null) orphan_business_analyses,
      (select count(*)::int from accounting_settings x left join workspaces w on w.id=x.workspace_id where w.id is null) orphan_accounting_settings,
      (select count(*)::int from business_research_usage x left join workspaces w on w.id=x.workspace_id where w.id is null) orphan_business_research_usage,
      (select count(*)::int from conversation_messages m left join conversations c on c.id=m.conversation_id and c.workspace_id=m.workspace_id where c.id is null) orphan_conversation_messages,
      (select count(*)::int from conversation_notes n left join conversations c on c.id=n.conversation_id and c.workspace_id=n.workspace_id where c.id is null) orphan_conversation_notes,
      (select count(*)::int from conversation_reads r left join conversations c on c.id=r.conversation_id and c.workspace_id=r.workspace_id where c.id is null) orphan_conversation_reads,
      (select count(*)::int from inbox_notifications n left join users u on u.id=n.user_id and u.workspace_id=n.workspace_id where u.id is null) orphan_inbox_notifications,
      (select count(*)::int from conversations where inbox_status not in ('ai_active','needs_human','human_active','resolved')) invalid_inbox_status,
      (select count(*)::int from conversations where bot_mode not in ('active','paused')) invalid_bot_mode,
      (select count(*)::int from conversations where priority not in ('low','normal','high','urgent')) invalid_inbox_priority,
      (select count(*)::int from conversation_messages where author_type not in ('customer','bot','human','system')) invalid_message_author,
      (select count(*)::int from conversation_messages where delivery_status not in ('received','pending','queued','sent','delivered','read','failed')) invalid_message_delivery,
      (select count(*)::int from users where role not in ('Owner','Admin','Agent','Bookkeeper')) invalid_user_role
  `);
  for (const [name, count] of Object.entries(integrity)) {
    assert.equal(Number(count), 0, `${name} must be zero`);
  }

  const rls = await sql`
    select relname, relrowsecurity from pg_class
    where relnamespace='public'::regnamespace and relname = any(${requiredTables})
  `;
  assert.equal(rls.length, requiredTables.length);
  assert.equal(rls.every((row) => row.relrowsecurity === true), true, "RLS must be enabled on every public Vox table.");
  const requiredConstraints = [
    "users_status_check", "users_role_check", "agents_type_check",
    "agents_status_check", "phone_numbers_channel_check",
    "conversations_channel_check", "conversations_inbox_status_check",
    "conversations_bot_mode_check", "conversations_priority_check",
    "conversations_automation_state_check",
    "conversations_state_version_check", "conversation_messages_channel_check",
    "conversation_messages_direction_check", "conversation_messages_author_check",
    "conversation_messages_delivery_check", "conversation_messages_body_check",
    "conversation_messages_human_author_check", "conversation_notes_body_check",
    "conversation_reads_sequence_check",
    "appointments_status_check", "bot_requests_status_check",
    "workspaces_subscription_status_check", "users_workspace_fk",
    "agents_workspace_fk", "conversations_workspace_fk",
    "phone_numbers_workspace_fk", "appointments_workspace_fk",
    "bot_requests_workspace_fk", "company_profiles_workspace_fk",
    ...[
      "sms_messages", "knowledge_sources", "knowledge_chunks", "calendar_connections",
      "voice_call_sessions", "client_invoices", "document_templates", "business_documents",
      "team_invitations", "widget_configs", "crm_connections", "crm_deliveries", "audit_events",
      "accounting_settings", "accounting_accounts", "journal_entries", "journal_lines", "business_analyses",
      "business_research_usage",
      "conversation_messages", "conversation_notes", "conversation_reads", "inbox_notifications",
    ].map((table) => `${table}_workspace_fk`),
    "agents_id_workspace_unique", "conversations_agent_workspace_fk",
    "phone_numbers_agent_workspace_fk", "appointments_agent_workspace_fk",
    "client_invoices_agent_workspace_fk", "business_documents_agent_workspace_fk",
    "bot_requests_agent_workspace_fk", "knowledge_sources_id_workspace_unique",
    "knowledge_chunks_source_workspace_fk", "accounting_settings_currency_check", "accounting_accounts_type_check",
    "journal_entries_status_check", "journal_entries_direction_check",
    "journal_lines_amount_check", "business_analyses_kind_check",
    "business_research_usage_count_check",
    "users_id_workspace_unique", "conversations_id_workspace_unique",
    "conversations_assigned_user_workspace_fk",
    "conversation_messages_conversation_workspace_fk",
    "conversation_messages_author_user_workspace_fk",
    "conversation_notes_conversation_workspace_fk",
    "conversation_notes_author_user_workspace_fk",
    "conversation_reads_conversation_workspace_fk",
    "conversation_reads_user_workspace_fk",
    "inbox_notifications_user_workspace_fk",
    "inbox_notifications_conversation_workspace_fk",
    "journal_lines_entry_workspace_fk", "journal_lines_account_workspace_fk",
  ];
  const constraints = await sql`
    select conname from pg_constraint where conname = any(${requiredConstraints})
  `;
  assert.deepEqual(
    new Set(constraints.map((row) => String(row.conname))),
    new Set(requiredConstraints),
    "Database integrity constraints are incomplete."
  );
  const [journalIntegrity] = await sql.unsafe(`
    select count(*)::int unbalanced_journals from (
      select e.id
      from journal_entries e
      left join journal_lines l on l.entry_id=e.id and l.workspace_id=e.workspace_id
      where e.status='posted'
      group by e.id
      having count(l.id) < 2
        or coalesce(sum(l.debit_cents),0) <= 0
        or coalesce(sum(l.debit_cents),0) <> coalesce(sum(l.credit_cents),0)
    ) invalid
  `);
  assert.equal(Number(journalIntegrity.unbalanced_journals), 0, "Every posted journal must balance.");
  const balanceTriggers = await sql`
    select tgname from pg_trigger
    where not tgisinternal and tgname = any(${[
      "journal_entries_balance_trigger", "journal_lines_balance_trigger",
    ]})
  `;
  assert.equal(balanceTriggers.length, 2, "Journal balance triggers must be installed.");
  console.log(`database audit passed (${requiredTables.length} tables, tenant integrity clean, RLS and constraints enabled)`);
} finally {
  await sql.end();
}

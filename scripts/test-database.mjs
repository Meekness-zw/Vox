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
    "webhook_events",
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
      (select count(*)::int from company_profiles x left join workspaces w on w.id=x.workspace_id where w.id is null) orphan_profiles
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
    "appointments_status_check", "bot_requests_status_check",
    "workspaces_subscription_status_check", "users_workspace_fk",
    "agents_workspace_fk", "conversations_workspace_fk",
    "phone_numbers_workspace_fk", "appointments_workspace_fk",
    "bot_requests_workspace_fk", "company_profiles_workspace_fk",
    ...[
      "sms_messages", "knowledge_sources", "knowledge_chunks", "calendar_connections",
      "voice_call_sessions", "client_invoices", "document_templates", "business_documents",
      "team_invitations", "widget_configs", "crm_connections", "crm_deliveries", "audit_events",
    ].map((table) => `${table}_workspace_fk`),
    "agents_id_workspace_unique", "conversations_agent_workspace_fk",
    "phone_numbers_agent_workspace_fk", "appointments_agent_workspace_fk",
    "client_invoices_agent_workspace_fk", "business_documents_agent_workspace_fk",
    "bot_requests_agent_workspace_fk", "knowledge_sources_id_workspace_unique",
    "knowledge_chunks_source_workspace_fk",
  ];
  const constraints = await sql`
    select conname from pg_constraint where conname = any(${requiredConstraints})
  `;
  assert.deepEqual(
    new Set(constraints.map((row) => String(row.conname))),
    new Set(requiredConstraints),
    "Database integrity constraints are incomplete."
  );
  console.log(`database audit passed (${requiredTables.length} tables, tenant integrity clean, RLS and constraints enabled)`);
} finally {
  await sql.end();
}

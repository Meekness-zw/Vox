import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the bookkeeping integration test.");
}

const { sql } = await import("../src/lib/db/index.ts");
const suffix = randomUUID().replaceAll("-", "");
const workspaceId = `ws_bookkeeping_test_${suffix}`;
const cashId = `acct_cash_${suffix}`;
const revenueId = `acct_revenue_${suffix}`;
const balancedId = `je_balanced_${suffix}`;
const secondBalancedId = `je_second_${suffix}`;
const unbalancedId = `je_unbalanced_${suffix}`;

try {
  await sql`
    insert into workspaces(id,name,plan)
    values(${workspaceId},'Temporary bookkeeping test','free')
  `;
  await sql`
    insert into accounting_settings(workspace_id,base_currency)
    values(${workspaceId},'USD')
  `;
  await sql`
    insert into accounting_accounts(id,workspace_id,code,name,type,system_key)
    values
      (${cashId},${workspaceId},'1000','Cash','asset','cash'),
      (${revenueId},${workspaceId},'4000','Revenue','revenue','sales_revenue')
  `;

  await sql.begin(async (tx) => {
    await tx`
      insert into journal_entries(id,workspace_id,entry_date,description,direction,currency,source_type,source_id,created_by)
      values(${balancedId},${workspaceId},current_date,'Balanced integration test','income','USD',
        'integration_test',${"request_" + suffix},'test@vox.local')
    `;
    await tx`
      insert into journal_lines(id,workspace_id,entry_id,account_id,debit_cents,credit_cents)
      values
        (${"jl_debit_" + suffix},${workspaceId},${balancedId},${cashId},12500,0),
        (${"jl_credit_" + suffix},${workspaceId},${balancedId},${revenueId},0,12500)
    `;
  });

  const [balanced] = await sql`
    select count(*)::int line_count,
      sum(debit_cents)::bigint debit_total,
      sum(credit_cents)::bigint credit_total
    from journal_lines where workspace_id=${workspaceId} and entry_id=${balancedId}
  `;
  assert.equal(Number(balanced.line_count), 2);
  assert.equal(Number(balanced.debit_total), 12_500);
  assert.equal(Number(balanced.credit_total), 12_500);

  const duplicate = await sql`
    insert into journal_entries(id,workspace_id,entry_date,description,direction,currency,source_type,source_id,created_by)
    values(${'je_duplicate_' + suffix},${workspaceId},current_date,'Duplicate integration test','income','USD',
      'integration_test',${"request_" + suffix},'test@vox.local')
    on conflict do nothing returning id
  `;
  assert.equal(duplicate.length, 0, "A repeated source request must not create a duplicate journal.");

  await sql.begin(async (tx) => {
    await tx`
      insert into journal_entries(id,workspace_id,entry_date,description,direction,currency,created_by)
      values(${secondBalancedId},${workspaceId},current_date,'Second balanced test','income','USD','test@vox.local')
    `;
    await tx`
      insert into journal_lines(id,workspace_id,entry_id,account_id,debit_cents,credit_cents)
      values
        (${"jl_second_debit_" + suffix},${workspaceId},${secondBalancedId},${cashId},5000,0),
        (${"jl_second_credit_" + suffix},${workspaceId},${secondBalancedId},${revenueId},0,5000)
    `;
  });
  await assert.rejects(
    sql.begin(async (tx) => {
      await tx`
        update journal_lines set entry_id=${secondBalancedId}
        where id=${"jl_debit_" + suffix} and workspace_id=${workspaceId}
      `;
    }),
    /not balanced/i,
    "Moving a line must validate both its old and new journal entries."
  );
  const [lineCounts] = await sql`
    select
      count(*) filter (where entry_id=${balancedId})::int first_count,
      count(*) filter (where entry_id=${secondBalancedId})::int second_count
    from journal_lines where workspace_id=${workspaceId}
  `;
  assert.equal(Number(lineCounts.first_count), 2, "The rejected move must restore the source journal.");
  assert.equal(Number(lineCounts.second_count), 2, "The rejected move must restore the target journal.");

  await assert.rejects(
    sql.begin(async (tx) => {
      await tx`
        insert into journal_entries(id,workspace_id,entry_date,description,direction,currency,created_by)
        values(${unbalancedId},${workspaceId},current_date,'Unbalanced integration test','income','USD','test@vox.local')
      `;
      await tx`
        insert into journal_lines(id,workspace_id,entry_id,account_id,debit_cents,credit_cents)
        values(${"jl_unbalanced_" + suffix},${workspaceId},${unbalancedId},${cashId},12500,0)
      `;
    }),
    /not balanced/i,
    "The database must reject an unbalanced posted journal."
  );
  const [rolledBack] = await sql`
    select count(*)::int count from journal_entries where id=${unbalancedId}
  `;
  assert.equal(Number(rolledBack.count), 0, "The rejected journal must roll back completely.");

  const triggers = await sql`
    select tgname from pg_trigger
    where not tgisinternal and tgname = any(${[
      "journal_entries_balance_trigger",
      "journal_lines_balance_trigger",
    ]})
  `;
  assert.equal(triggers.length, 2, "Both deferred balance triggers must be installed.");
  console.log("bookkeeping integration passed (balanced/idempotent writes accepted; unbalanced writes and line moves rejected)");
} finally {
  await sql`delete from workspaces where id=${workspaceId}`.catch(() => undefined);
  await sql.end();
}

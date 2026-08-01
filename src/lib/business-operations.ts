import { sql } from "@/lib/db";
import { currencyFractionDigits } from "@/lib/currency";
import type {
  BookkeepingEntry,
  BookkeepingSummary,
  BusinessAnalysis,
  ResearchSource,
} from "@/lib/types";

const DEFAULT_ACCOUNTS = [
  { code: "1000", name: "Cash and bank", type: "asset", key: "cash" },
  { code: "2000", name: "Accounts payable", type: "liability", key: "accounts_payable" },
  { code: "3000", name: "Owner equity", type: "equity", key: "owner_equity" },
  { code: "4000", name: "Sales revenue", type: "revenue", key: "sales_revenue" },
  { code: "5000", name: "Operating expenses", type: "expense", key: "operating_expense" },
] as const;

function requireDatabase() {
  if (!sql) throw new Error("Bookkeeping requires DATABASE_URL.");
  return sql;
}

export async function ensureDefaultAccounts(workspaceId: string) {
  const db = requireDatabase();
  const [ready] = await db`
    select
      exists(select 1 from accounting_settings where workspace_id=${workspaceId}) settings_ready,
      (select count(*)::int from accounting_accounts
        where workspace_id=${workspaceId} and system_key = any(${DEFAULT_ACCOUNTS.map((account) => account.key)})) account_count
  `;
  if (ready?.settings_ready === true && Number(ready.account_count) === DEFAULT_ACCOUNTS.length) return;
  await db`
    insert into accounting_settings(workspace_id,base_currency)
    select ${workspaceId},coalesce((
      select case
        when currency ~ '^[A-Za-z]{3}$' then upper(currency)
        else 'USD'
      end
      from document_templates where workspace_id=${workspaceId}
    ),'USD')
    on conflict(workspace_id) do nothing
  `;
  await db`
    insert into accounting_accounts(id,workspace_id,code,name,type,system_key)
    values
      (${"acct_" + crypto.randomUUID()},${workspaceId},${DEFAULT_ACCOUNTS[0].code},${DEFAULT_ACCOUNTS[0].name},${DEFAULT_ACCOUNTS[0].type},${DEFAULT_ACCOUNTS[0].key}),
      (${"acct_" + crypto.randomUUID()},${workspaceId},${DEFAULT_ACCOUNTS[1].code},${DEFAULT_ACCOUNTS[1].name},${DEFAULT_ACCOUNTS[1].type},${DEFAULT_ACCOUNTS[1].key}),
      (${"acct_" + crypto.randomUUID()},${workspaceId},${DEFAULT_ACCOUNTS[2].code},${DEFAULT_ACCOUNTS[2].name},${DEFAULT_ACCOUNTS[2].type},${DEFAULT_ACCOUNTS[2].key}),
      (${"acct_" + crypto.randomUUID()},${workspaceId},${DEFAULT_ACCOUNTS[3].code},${DEFAULT_ACCOUNTS[3].name},${DEFAULT_ACCOUNTS[3].type},${DEFAULT_ACCOUNTS[3].key}),
      (${"acct_" + crypto.randomUUID()},${workspaceId},${DEFAULT_ACCOUNTS[4].code},${DEFAULT_ACCOUNTS[4].name},${DEFAULT_ACCOUNTS[4].type},${DEFAULT_ACCOUNTS[4].key})
    on conflict do nothing
  `;
}

export async function claimBusinessResearch(workspaceId: string) {
  const db = requireDatabase();
  const configuredLimit = Number(process.env.VOX_RESEARCH_DAILY_LIMIT ?? "20");
  const dailyLimit = Number.isInteger(configuredLimit)
    ? Math.min(100, Math.max(1, configuredLimit))
    : 20;
  const rows = await db`
    insert into business_research_usage(workspace_id,usage_date,request_count,last_started_at)
    values(${workspaceId},current_date,1,now())
    on conflict(workspace_id) do update set
      usage_date=current_date,
      request_count=case
        when business_research_usage.usage_date=current_date then business_research_usage.request_count+1
        else 1
      end,
      last_started_at=now()
    where business_research_usage.usage_date<>current_date
       or (
         business_research_usage.request_count < ${dailyLimit}
         and business_research_usage.last_started_at <= now() - interval '30 seconds'
       )
    returning request_count
  `;
  if (rows.length) return Number(rows[0].request_count);
  const [usage] = await db`
    select usage_date=current_date is_today,request_count,last_started_at
    from business_research_usage where workspace_id=${workspaceId}
  `;
  if (usage?.is_today === true && Number(usage.request_count) >= dailyLimit) {
    throw new Error(`This workspace has reached its ${dailyLimit}-report daily research limit.`);
  }
  throw new Error("Please wait 30 seconds before starting another research report.");
}

export async function updateAccountingCurrency(input: {
  workspaceId: string;
  currency: string;
  actorEmail: string;
}) {
  const currency = input.currency.trim().toUpperCase();
  currencyFractionDigits(currency);
  const db = requireDatabase();
  await ensureDefaultAccounts(input.workspaceId);
  await db.begin(async (tx) => {
    await tx`
      select workspace_id from accounting_settings
      where workspace_id=${input.workspaceId} for update
    `;
    const [count] = await tx`
      select count(*)::int count from journal_entries where workspace_id=${input.workspaceId}
    `;
    if (Number(count.count) > 0) {
      throw new Error("The base currency cannot be changed after the first bookkeeping entry.");
    }
    await tx`
      update accounting_settings set base_currency=${currency},updated_at=now()
      where workspace_id=${input.workspaceId}
    `;
    await tx`
      insert into audit_events(id,workspace_id,actor_email,action,details)
      values(${"aud_" + crypto.randomUUID()},${input.workspaceId},${input.actorEmail},
        'bookkeeping.currency_changed',${tx.json({ currency })})
    `;
  });
}

export async function recordCashbookTransaction(input: {
  workspaceId: string;
  direction: "income" | "expense";
  entryDate: string;
  amountCents: number;
  currency: string;
  description: string;
  reference?: string;
  sourceId: string;
  createdBy: string;
}) {
  if (!input.workspaceId.trim()) throw new Error("A workspace is required.");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("The bookkeeping amount must be a positive number of minor currency units.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.entryDate)) throw new Error("A valid entry date is required.");
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("A valid three-letter currency is required.");
  if (!input.description.trim() || input.description.length > 500) {
    throw new Error("A description of 500 characters or fewer is required.");
  }
  if (!/^[A-Za-z0-9-]{16,100}$/.test(input.sourceId)) {
    throw new Error("A valid transaction request identifier is required.");
  }
  const db = requireDatabase();
  await ensureDefaultAccounts(input.workspaceId);
  const accounts = await db`
    select id,system_key from accounting_accounts
    where workspace_id=${input.workspaceId} and system_key = any(${[
      "cash",
      input.direction === "income" ? "sales_revenue" : "operating_expense",
    ]})
  `;
  const byKey = new Map(accounts.map((row) => [String(row.system_key), String(row.id)]));
  const cashId = byKey.get("cash");
  const categoryId = byKey.get(input.direction === "income" ? "sales_revenue" : "operating_expense");
  if (!cashId || !categoryId) throw new Error("The default chart of accounts is incomplete.");
  const entryId = "je_" + crypto.randomUUID();
  return db.begin(async (tx) => {
    const [settings] = await tx`
      select base_currency from accounting_settings
      where workspace_id=${input.workspaceId} for share
    `;
    if (String(settings?.base_currency ?? "USD") !== input.currency) {
      throw new Error(`Bookkeeping uses ${String(settings?.base_currency ?? "USD")}. Convert the amount before posting.`);
    }
    const inserted = await tx`
      insert into journal_entries(id,workspace_id,entry_date,description,reference,direction,currency,
        source_type,source_id,created_by)
      values(${entryId},${input.workspaceId},${input.entryDate},${input.description},${input.reference ?? null},
        ${input.direction},${input.currency},'dashboard_cashbook',${input.sourceId},${input.createdBy})
      on conflict do nothing returning id
    `;
    if (!inserted.length) {
      const [existing] = await tx`
        select id from journal_entries
        where workspace_id=${input.workspaceId} and source_type='dashboard_cashbook'
          and source_id=${input.sourceId}
        limit 1
      `;
      if (!existing) throw new Error("The transaction identifier conflicts with another entry.");
      return { entryId: String(existing.id), created: false };
    }
    if (input.direction === "income") {
      await tx`
        insert into journal_lines(id,workspace_id,entry_id,account_id,memo,debit_cents,credit_cents)
        values
          (${"jl_" + crypto.randomUUID()},${input.workspaceId},${entryId},${cashId},${input.description},${input.amountCents},0),
          (${"jl_" + crypto.randomUUID()},${input.workspaceId},${entryId},${categoryId},${input.description},0,${input.amountCents})
      `;
    } else {
      await tx`
        insert into journal_lines(id,workspace_id,entry_id,account_id,memo,debit_cents,credit_cents)
        values
          (${"jl_" + crypto.randomUUID()},${input.workspaceId},${entryId},${categoryId},${input.description},${input.amountCents},0),
          (${"jl_" + crypto.randomUUID()},${input.workspaceId},${entryId},${cashId},${input.description},0,${input.amountCents})
      `;
    }
    await tx`
      insert into audit_events(id,workspace_id,actor_email,action,details)
      values(${"aud_" + crypto.randomUUID()},${input.workspaceId},${input.createdBy},
        'bookkeeping.entry_posted',${tx.json({
          entryId,
          direction: input.direction,
          amountCents: input.amountCents,
          currency: input.currency,
        })})
    `;
    return { entryId, created: true };
  });
}

export async function getBookkeepingSummary(workspaceId: string): Promise<BookkeepingSummary> {
  const db = requireDatabase();
  await ensureDefaultAccounts(workspaceId);
  const [row] = await db`
    select
      coalesce(sum(case when e.id is not null and a.system_key='cash' then l.debit_cents-l.credit_cents else 0 end),0)::bigint cash,
      coalesce(sum(case when e.id is not null and a.type='revenue' then l.credit_cents-l.debit_cents else 0 end),0)::bigint revenue,
      coalesce(sum(case when e.id is not null and a.type='expense' then l.debit_cents-l.credit_cents else 0 end),0)::bigint expenses,
      max(s.base_currency) currency,
      (select count(*)::int from journal_entries posted
        where posted.workspace_id=${workspaceId} and posted.status='posted') entry_count
    from accounting_accounts a
    join accounting_settings s on s.workspace_id=a.workspace_id
    left join journal_lines l on l.account_id=a.id and l.workspace_id=a.workspace_id
    left join journal_entries e on e.id=l.entry_id and e.workspace_id=l.workspace_id and e.status='posted'
    where a.workspace_id=${workspaceId}
  `;
  const revenueCents = Number(row.revenue ?? 0);
  const expenseCents = Number(row.expenses ?? 0);
  return {
    currency: String(row.currency ?? "USD"),
    cashCents: Number(row.cash ?? 0),
    revenueCents,
    expenseCents,
    profitCents: revenueCents - expenseCents,
    entryCount: Number(row.entry_count ?? 0),
  };
}

export async function listBookkeepingEntries(workspaceId: string): Promise<BookkeepingEntry[]> {
  const db = requireDatabase();
  const rows = await db`
    select e.*, coalesce(sum(l.debit_cents),0)::bigint amount_cents
    from journal_entries e
    join journal_lines l on l.entry_id=e.id and l.workspace_id=e.workspace_id
    where e.workspace_id=${workspaceId} and e.status='posted'
    group by e.id order by e.entry_date desc,e.created_at desc limit 100
  `;
  return rows.map((row) => ({
    id: String(row.id),
    entryDate: row.entry_date instanceof Date
      ? row.entry_date.toISOString().slice(0, 10)
      : String(row.entry_date).slice(0, 10),
    description: String(row.description),
    reference: row.reference ? String(row.reference) : undefined,
    direction: String(row.direction) as BookkeepingEntry["direction"],
    amountCents: Number(row.amount_cents),
    currency: String(row.currency),
    createdBy: String(row.created_by),
    createdAt: new Date(row.created_at as Date).toISOString(),
  }));
}

export async function saveBusinessAnalysis(input: {
  workspaceId: string;
  kind: BusinessAnalysis["kind"];
  title: string;
  query: string;
  report: string;
  sources: ResearchSource[];
  model?: string;
  createdBy: string;
}) {
  const db = requireDatabase();
  const id = "ba_" + crypto.randomUUID();
  await db.begin(async (tx) => {
    await tx`
      insert into business_analyses(id,workspace_id,kind,title,query,report,sources,model,created_by)
      values(${id},${input.workspaceId},${input.kind},${input.title},${input.query},${input.report},
        ${tx.json(input.sources)},${input.model ?? null},${input.createdBy})
    `;
    await tx`
      insert into audit_events(id,workspace_id,actor_email,action,details)
      values(${"aud_" + crypto.randomUUID()},${input.workspaceId},${input.createdBy},
        'business.analysis_created',${tx.json({
          analysisId: id,
          kind: input.kind,
          sourceCount: input.sources.length,
          model: input.model,
        })})
    `;
  });
  return id;
}

export async function listBusinessAnalyses(workspaceId: string): Promise<BusinessAnalysis[]> {
  const db = requireDatabase();
  const rows = await db`
    select * from business_analyses where workspace_id=${workspaceId}
    order by created_at desc limit 30
  `;
  return rows.map((row) => ({
    id: String(row.id),
    kind: String(row.kind) as BusinessAnalysis["kind"],
    title: String(row.title),
    query: String(row.query),
    report: String(row.report),
    sources: (row.sources as ResearchSource[]) ?? [],
    model: row.model ? String(row.model) : undefined,
    createdBy: String(row.created_by),
    createdAt: new Date(row.created_at as Date).toISOString(),
  }));
}

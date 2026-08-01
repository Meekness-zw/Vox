import { BookOpenCheck, ExternalLink, ReceiptText, TrendingUp } from "lucide-react";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/dashboard/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { AccountingCurrencyForm, BookkeepingEntryForm, BusinessAnalysisForm } from "@/components/dashboard/business-copilot-forms";
import { requireSession } from "@/lib/auth/session-cookies";
import { getBookkeepingSummary, listBookkeepingEntries, listBusinessAnalyses } from "@/lib/business-operations";
import { currencyFractionDigits, formatMinorMoney } from "@/lib/currency";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function BusinessCopilotPage() {
  const session = await requireSession();
  if (!["Owner", "Admin", "Bookkeeper"].includes(session.role ?? "")) redirect("/dashboard");
  const [summary, entries, analyses] = await Promise.all([
    getBookkeepingSummary(session.workspaceId),
    listBookkeepingEntries(session.workspaceId),
    listBusinessAnalyses(session.workspaceId),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const bookkeepingRequestId = crypto.randomUUID();
  const fractionDigits = currencyFractionDigits(summary.currency);
  return <>
    <Topbar title="Business Copilot" />
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">Private business operations</h2>
        <p className="mt-1 text-sm text-muted-foreground">Double-entry cashbook, evidence-based SWOT analysis, and cited sales research. This area is never exposed to callers or website visitors.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Cash balance" value={formatMinorMoney(summary.cashCents, summary.currency)} />
        <StatCard label="Recorded revenue" value={formatMinorMoney(summary.revenueCents, summary.currency)} />
        <StatCard label="Recorded expenses" value={formatMinorMoney(summary.expenseCents, summary.currency)} />
        <StatCard label="Net profit" value={formatMinorMoney(summary.profitCents, summary.currency)} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="size-5 text-primary" />Post income or expense</CardTitle><p className="text-sm text-muted-foreground">Creates a balanced, tenant-scoped journal entry and audit event.</p></CardHeader><CardContent className="space-y-5"><AccountingCurrencyForm key={summary.currency} currentCurrency={summary.currency} locked={summary.entryCount > 0} /><BookkeepingEntryForm currency={summary.currency} fractionDigits={fractionDigits} today={today} requestId={bookkeepingRequestId} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="size-5 text-primary" />SWOT and sales research</CardTitle><p className="text-sm text-muted-foreground">The Python Business Copilot searches current public sources and saves the result.</p></CardHeader><CardContent><BusinessAnalysisForm /></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Bookkeeping journal</CardTitle><p className="text-sm text-muted-foreground">{summary.entryCount} posted entr{summary.entryCount === 1 ? "y" : "ies"}{summary.entryCount > entries.length ? ` · showing latest ${entries.length}` : ""}</p></CardHeader><CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-y bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">Description</th><th className="px-5 py-3 font-medium">Amount</th><th className="px-5 py-3 font-medium">Type</th></tr></thead>
          <tbody className="divide-y">
            {!entries.length && <tr><td colSpan={4} className="p-10 text-center text-sm text-muted-foreground"><BookOpenCheck className="mx-auto mb-3 size-8" />No bookkeeping entries yet.</td></tr>}
            {entries.map((entry) => <tr key={entry.id}><td className="whitespace-nowrap px-5 py-4">{entry.entryDate}</td><td className="px-5 py-4"><p className="font-medium">{entry.description}</p><p className="text-xs text-muted-foreground">{entry.reference || entry.createdBy}</p></td><td className={entry.direction === "income" ? "whitespace-nowrap px-5 py-4 font-medium text-success" : "whitespace-nowrap px-5 py-4 font-medium text-danger"}>{entry.direction === "income" ? "+" : "−"}{formatMinorMoney(entry.amountCents, entry.currency)}</td><td className="px-5 py-4"><Badge variant={entry.direction === "income" ? "success" : "muted"}>{entry.direction}</Badge></td></tr>)}
          </tbody>
        </table>
      </CardContent></Card>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Saved business intelligence</h2>
        {!analyses.length && <Card className="p-10 text-center text-sm text-muted-foreground">No SWOT or sales research saved yet.</Card>}
        {analyses.map((analysis) => <Card key={analysis.id}><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>{analysis.title}</CardTitle><Badge variant={analysis.kind === "swot" ? "default" : "success"}>{analysis.kind === "swot" ? "SWOT" : "Sales research"}</Badge></div><p className="text-sm text-muted-foreground">{new Date(analysis.createdAt).toLocaleString()} · {analysis.model || "Python research"}</p></CardHeader><CardContent className="space-y-5"><p className="text-sm font-medium">Goal: {analysis.query}</p><div className="whitespace-pre-wrap text-sm leading-7">{analysis.report}</div>{analysis.sources.length > 0 && <div><h3 className="mb-2 text-sm font-semibold">Sources</h3><ul className="space-y-2">{analysis.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-2 break-all text-sm text-primary hover:underline"><ExternalLink className="mt-0.5 size-3.5 shrink-0" />{source.title}</a></li>)}</ul></div>}</CardContent></Card>)}
      </div>
    </div>
  </>;
}

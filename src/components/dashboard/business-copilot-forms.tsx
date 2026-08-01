"use client";

import { useActionState } from "react";
import { BrainCircuit, Check, Loader2, Plus } from "lucide-react";
import {
  generateBusinessAnalysisAction,
  recordTransactionAction,
  updateAccountingCurrencyAction,
  type BusinessActionState,
} from "@/app/(dashboard)/dashboard/business/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

const initialState: BusinessActionState = {};

function Result({ state }: { state: BusinessActionState }) {
  if (state.error) return <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>;
  if (state.ok) return <p role="status" className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success"><Check className="size-4" />{state.message}</p>;
  return null;
}

export function BookkeepingEntryForm({
  currency,
  fractionDigits,
  today,
  requestId,
}: {
  currency: string;
  fractionDigits: number;
  today: string;
  requestId: string;
}) {
  const [state, action, pending] = useActionState(recordTransactionAction, initialState);
  const idempotencyKey = state.nextId ?? requestId;
  const amountStep = fractionDigits === 0 ? "1" : `0.${"0".repeat(fractionDigits - 1)}1`;
  return <form action={action} className="space-y-4">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Type" htmlFor="bookkeeping-direction"><select id="bookkeeping-direction" name="direction" className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="income">Income received</option><option value="expense">Expense paid</option></select></Field>
      <Field label="Date" htmlFor="bookkeeping-date"><Input id="bookkeeping-date" name="entryDate" type="date" defaultValue={today} required /></Field>
      <Field label="Currency" htmlFor="bookkeeping-currency"><Input id="bookkeeping-currency" name="currency" defaultValue={currency} maxLength={3} readOnly required /></Field>
    </div>
    <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
      <Field label="Description" htmlFor="bookkeeping-description"><Input id="bookkeeping-description" name="description" maxLength={500} placeholder="What was sold or purchased?" required /></Field>
      <Field label={`Amount (${currency})`} htmlFor="bookkeeping-amount"><Input id="bookkeeping-amount" name="amount" type="number" min={amountStep} max="100000000" step={amountStep} required /></Field>
    </div>
    <Field label="Reference (optional)" htmlFor="bookkeeping-reference"><Input id="bookkeeping-reference" name="reference" maxLength={200} placeholder="Receipt, invoice or bank reference" /></Field>
    <p className="text-xs text-muted-foreground">Vox posts two equal journal lines for every entry. This cashbook is not a replacement for professional tax advice or bank reconciliation.</p>
    <Result state={state} />
    <Button disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Plus />}{pending ? "Posting…" : "Post balanced entry"}</Button>
  </form>;
}

export function AccountingCurrencyForm({
  currentCurrency,
  locked,
}: {
  currentCurrency: string;
  locked: boolean;
}) {
  const [state, action, pending] = useActionState(updateAccountingCurrencyAction, initialState);
  return <form action={action} className="rounded-md border bg-muted/30 p-3">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Field label="Base currency" htmlFor="accounting-base-currency">
          <Input id="accounting-base-currency" name="currency" defaultValue={currentCurrency} minLength={3} maxLength={3} disabled={locked} className="uppercase" required />
        </Field>
      </div>
      <Button type="submit" variant="secondary" disabled={pending || locked}>
        {pending && <Loader2 className="animate-spin" />}{pending ? "Saving…" : "Save currency"}
      </Button>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">
      {locked ? "Locked after the first journal entry to keep reports consistent." : "Set this before posting the first entry. Examples: USD, ZAR, ZWG, GBP."}
    </p>
    <div className="mt-2"><Result state={state} /></div>
  </form>;
}

export function BusinessAnalysisForm() {
  const [state, action, pending] = useActionState(generateBusinessAnalysisAction, initialState);
  return <form action={action} className="space-y-4">
    <Field label="Analysis" htmlFor="business-analysis-kind"><select id="business-analysis-kind" name="kind" className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="swot">SWOT analysis</option><option value="sales_research">Sales growth research</option></select></Field>
    <Field label="Research goal" htmlFor="business-analysis-query"><Textarea id="business-analysis-query" name="query" minLength={10} maxLength={2000} rows={5} placeholder="Example: Assess our position in Harare and identify the three best customer segments and offers for the next 90 days." required /></Field>
    <p className="text-xs text-muted-foreground">Research uses the approved company profile and aggregate bookkeeping totals only. Customer-level financial records are never sent to the research model.</p>
    <Result state={state} />
    <Button disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <BrainCircuit />}{pending ? "Researching the web…" : "Research and save"}</Button>
  </form>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>;
}

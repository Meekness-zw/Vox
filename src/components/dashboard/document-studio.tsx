"use client";

import { useActionState } from "react";
import { Check, FilePlus2, Loader2, Palette } from "lucide-react";
import {
  createDocumentAction,
  saveDocumentTemplateAction,
  type DocumentActionState,
} from "@/app/(dashboard)/dashboard/documents/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import type { DocumentTemplate } from "@/lib/types";

const initialState: DocumentActionState = {};

function Result({ state }: { state: DocumentActionState }) {
  if (state.error) {
    return <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>;
  }
  if (state.ok) {
    return <p className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success"><Check className="size-4" />{state.message}</p>;
  }
  return null;
}

export function NewBusinessDocumentForm() {
  const [state, action, pending] = useActionState(createDocumentAction, initialState);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Document type">
          <select name="type" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
            <option value="quotation">Quotation</option>
            <option value="invoice">Invoice</option>
            <option value="receipt">Receipt</option>
            <option value="delivery_order">Delivery order</option>
            <option value="purchase_order">Purchase order</option>
            <option value="credit_note">Credit note</option>
          </select>
        </Field>
        <Field label="Customer / company"><Input name="contactName" required /></Field>
        <Field label="Email"><Input name="contactEmail" type="email" /></Field>
        <Field label="Phone"><Input name="contactPhone" /></Field>
      </div>
      <Field label="Customer or delivery address"><Textarea name="contactAddress" rows={2} /></Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_110px_150px]">
        <Field label="Item or service"><Input name="description" required /></Field>
        <Field label="Quantity"><Input name="quantity" type="number" min="1" defaultValue="1" /></Field>
        <Field label="Unit price"><Input name="unitPrice" type="number" min="0" step="0.01" required /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="SKU / item code"><Input name="sku" /></Field>
        <Field label="Tax rate (%)"><Input name="taxRate" type="number" min="0" step="0.01" defaultValue="0" /></Field>
        <Field label="Due date"><Input name="dueDate" type="date" /></Field>
      </div>
      <Field label="Delivery / order reference"><Input name="deliveryReference" /></Field>
      <Field label="Notes"><Textarea name="notes" rows={3} /></Field>
      <Result state={state} />
      <Button disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <FilePlus2 />}{pending ? "Creating…" : "Create and save"}</Button>
    </form>
  );
}

export function DocumentDesignForm({ template }: { template: DocumentTemplate }) {
  const [state, action, pending] = useActionState(saveDocumentTemplateAction, initialState);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name"><Input name="businessName" defaultValue={template.businessName} required /></Field>
        <Field label="Currency"><Input name="currency" defaultValue={template.currency} maxLength={3} required /></Field>
        <Field label="Primary colour"><Input name="primaryColor" type="color" defaultValue={template.primaryColor} /></Field>
        <Field label="Text colour"><Input name="accentColor" type="color" defaultValue={template.accentColor} /></Field>
        <Field label="Phone"><Input name="phone" defaultValue={template.phone} /></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={template.email} /></Field>
        <Field label="Tax / registration number"><Input name="taxNumber" defaultValue={template.taxNumber} /></Field>
        <Field label="Logo URL"><Input name="logoUrl" type="url" placeholder="https://…" defaultValue={template.logoUrl} /></Field>
      </div>
      <Field label="Business address"><Textarea name="address" rows={2} defaultValue={template.address} /></Field>
      <Field label="Payment terms"><Textarea name="paymentTerms" rows={2} defaultValue={template.paymentTerms} /></Field>
      <Field label="Document footer"><Input name="footer" defaultValue={template.footer} /></Field>
      <Result state={state} />
      <Button variant="secondary" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Palette />}{pending ? "Saving…" : "Save document design"}</Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

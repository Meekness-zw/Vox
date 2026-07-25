"use client";

import { useActionState } from "react";
import { Loader2, Plus, Check } from "lucide-react";
import {
  createInvoiceAction,
  type CreateInvoiceState,
} from "@/app/(dashboard)/dashboard/invoices/actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";

export function NewInvoiceForm() {
  const [state, formAction, pending] = useActionState<CreateInvoiceState, FormData>(
    createInvoiceAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="inv-name">Client name</Label>
          <Input id="inv-name" name="contactName" placeholder="Jamie Rivera" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-email">Client email</Label>
          <Input
            id="inv-email"
            name="contactEmail"
            type="email"
            placeholder="jamie@example.com"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inv-desc">Service / item</Label>
        <Input id="inv-desc" name="description" placeholder="Routine cleaning" required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="inv-qty">Quantity</Label>
          <Input id="inv-qty" name="quantity" type="number" min="1" defaultValue="1" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-price">Unit price (USD)</Label>
          <Input id="inv-price" name="unitPrice" type="number" min="0" step="0.01" placeholder="120.00" required />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inv-notes">Notes (optional)</Label>
        <Textarea id="inv-notes" name="notes" rows={3} placeholder="Thanks for visiting!" />
      </div>

      {state.error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          <Check className="size-4" /> {state.message}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {pending ? "Creating…" : "Create & send invoice"}
      </Button>
    </form>
  );
}

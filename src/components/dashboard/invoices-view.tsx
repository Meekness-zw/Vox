"use client";

import { useState } from "react";
import { Download, Receipt } from "lucide-react";
import type { ClientInvoice } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn, timeAgo } from "@/lib/utils";

const statusVariant: Record<ClientInvoice["status"], "muted" | "default" | "success" | "danger"> = {
  draft: "muted",
  sent: "default",
  paid: "success",
  void: "danger",
};

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function InvoicesView({ invoices }: { invoices: ClientInvoice[] }) {
  const [selectedId, setSelectedId] = useState(invoices[0]?.id);
  const selected = invoices.find((i) => i.id === selectedId);

  if (invoices.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-10 text-sm text-muted-foreground">
        No invoices yet — create one above, or let your agent create one during a conversation.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="space-y-2">
        {invoices.map((inv) => (
          <button
            key={inv.id}
            onClick={() => setSelectedId(inv.id)}
            className={cn(
              "w-full rounded-lg border p-3 text-left transition-colors",
              selectedId === inv.id
                ? "border-primary bg-accent/40"
                : "border-border bg-card hover:bg-muted"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Receipt className="size-4 text-muted-foreground" />
                {inv.contactName}
              </span>
              <Badge variant={statusVariant[inv.status]}>{inv.status}</Badge>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{inv.contactEmail}</p>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              <span>{usd(inv.totalCents)}</span>
              <span>·</span>
              <span>{timeAgo(inv.createdAt)}</span>
            </div>
          </button>
        ))}
      </div>

      {selected ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Invoice #{selected.id}</h2>
                <p className="text-sm text-muted-foreground">
                  {selected.contactName} · {selected.contactEmail}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant[selected.status]}>{selected.status}</Badge>
                <a
                  href={`/api/invoices/${selected.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  <Download className="size-4" /> PDF
                </a>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold">Line items</h3>
            <div className="mt-3 divide-y divide-border">
              {selected.lineItems.map((li, i) => (
                <div key={i} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {li.description} <span className="text-muted-foreground">× {li.quantity}</span>
                  </span>
                  <span>{usd(li.quantity * li.unitPriceCents)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm font-semibold">
              <span>Total</span>
              <span>{usd(selected.totalCents)}</span>
            </div>
            {selected.notes && (
              <p className="mt-4 text-sm text-muted-foreground">{selected.notes}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-10 text-sm text-muted-foreground">
          Select an invoice to view details
        </div>
      )}
    </div>
  );
}

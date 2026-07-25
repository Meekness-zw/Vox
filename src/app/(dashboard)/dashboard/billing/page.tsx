import { Download } from "lucide-react";
import { Topbar } from "@/components/dashboard/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlanSwitcher } from "@/components/dashboard/plan-switcher";
import { plans } from "@/lib/pricing";
import { requireSession } from "@/lib/auth/session-cookies";
import { getWorkspaceSubscription } from "@/lib/repository";
import { confirmStripeCheckout } from "@/lib/stripe";

const usage = [
  { label: "Voice minutes", used: 1842, limit: 3000, unit: "min" },
  { label: "Chat conversations", used: 6240, limit: 10000, unit: "" },
  { label: "AI agents", used: 3, limit: 5, unit: "" },
];

const invoices = [
  { id: "INV-2026-006", date: "Jun 1, 2026", amount: "$299.00", status: "Paid" },
  { id: "INV-2026-005", date: "May 1, 2026", amount: "$299.00", status: "Paid" },
  { id: "INV-2026-004", date: "Apr 1, 2026", amount: "$99.00", status: "Paid" },
];

export default async function BillingPage({ searchParams }: {
  searchParams: Promise<{ required?: string; botRequest?: string; status?: string; session_id?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  if (params.status === "success" && params.session_id) {
    await confirmStripeCheckout(params.session_id, session.workspaceId);
  }
  const subscription = await getWorkspaceSubscription(session.workspaceId);
  const current = plans.find((p) => p.id === subscription.plan);

  return (
    <>
      <Topbar title="Billing" />
      <div className="space-y-6 p-4 sm:p-6">
        {params.required === "1" && (
          <div className="rounded-lg border border-primary/25 bg-accent p-4 text-sm">
            <strong>Payment is required for a customized bot.</strong>{" "}
            Choose a plan below. You can continue using the public Vox demo for free.
          </div>
        )}
        {params.status === "success" && (
          <div className="rounded-lg border border-success/25 bg-green-50 p-4 text-sm text-green-800">
            Payment received. Stripe is confirming your subscription and your bot request will move to review automatically.
          </div>
        )}
        {/* Current plan + usage */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {current?.name ?? "Free testing"} plan{" "}
                <Badge variant={subscription.status === "active" ? "success" : "muted"}>
                  {subscription.status.replaceAll("_", " ")}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {current
                  ? `${current.priceLabel}/month${subscription.dueAt ? ` · renews ${new Date(subscription.dueAt).toLocaleDateString()}` : ""}`
                  : "Test Vox for free. Subscribe when you want your own tailored bot."}
              </p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-3">
            {usage.map((u) => {
              const pct = Math.min(100, Math.round((u.used / u.limit) * 100));
              return (
                <div key={u.label}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{u.label}</span>
                    <span className="font-medium tabular-nums">
                      {u.used.toLocaleString()} / {u.limit.toLocaleString()} {u.unit}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Plans */}
        <div>
          <h2 className="mb-3 text-sm font-semibold">Change plan</h2>
          <PlanSwitcher currentPlanId={subscription.plan} botRequestId={params.botRequest} />
        </div>

        {/* Invoices */}
        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/50">
                    <td className="px-5 py-3.5 font-medium">{inv.id}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{inv.date}</td>
                    <td className="px-5 py-3.5 tabular-nums">{inv.amount}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant="success">{inv.status}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <Download className="size-3.5" /> PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

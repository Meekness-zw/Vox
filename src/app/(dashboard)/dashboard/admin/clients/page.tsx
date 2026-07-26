import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, Plus, Users } from "lucide-react";
import { setClientPaidStatus, updateClientSubscription } from "./actions";
import { Topbar } from "@/components/dashboard/topbar";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isVoxAdmin } from "@/lib/admin";
import { requireSession } from "@/lib/auth/session-cookies";
import { listAdminClients } from "@/lib/repository";

export const dynamic = "force-dynamic";
const variant = { active: "success", free: "muted", past_due: "danger", cancelled: "warning" } as const;

export default async function AdminClientsPage() {
  const session = await requireSession();
  if (!isVoxAdmin(session.email)) redirect("/dashboard");
  const clients = await listAdminClients();
  return <><Topbar title="Users & subscriptions" /><div className="space-y-6 p-4 sm:p-6">
    <div><h2 className="font-semibold">Client accounts</h2><p className="text-sm text-muted-foreground">Switch accounts between free and paid, manage plans, and build client bots.</p></div>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Client workspaces" value={String(clients.length)} />
      <StatCard label="Paid accounts" value={String(clients.filter(c => c.subscriptionStatus === "active").length)} />
      <StatCard label="Free accounts" value={String(clients.filter(c => c.subscriptionStatus === "free").length)} />
      <StatCard label="Past due" value={String(clients.filter(c => c.subscriptionStatus === "past_due").length)} />
    </div>
    <Card><CardHeader><CardTitle>All users and subscriptions</CardTitle></CardHeader><CardContent className="space-y-4">
      {clients.map(client => <div key={client.workspaceId} className="rounded-xl border p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3"><div className="flex size-10 items-center justify-center rounded-lg bg-accent"><Users className="size-5" /></div><div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{client.workspaceName}</p><Badge variant={variant[client.subscriptionStatus]}>{client.subscriptionStatus === "active" ? "paid" : client.subscriptionStatus.replaceAll("_"," ")}</Badge></div>
            <p className="truncate text-sm text-muted-foreground">{client.ownerName} · {client.ownerEmail}</p>
            <p className="text-xs text-muted-foreground">{client.users} users · {client.bots} bots{client.subscriptionDueAt ? ` · due ${new Date(client.subscriptionDueAt).toLocaleDateString()}` : ""}</p>
          </div></div>
          <div className="space-y-2 xl:w-[650px]">
            <form action={setClientPaidStatus} className="flex justify-end"><input type="hidden" name="workspaceId" value={client.workspaceId} /><Button size="sm" name="paid" value={client.subscriptionStatus === "active" ? "false" : "true"} variant={client.subscriptionStatus === "active" ? "outline" : "primary"}>{client.subscriptionStatus === "active" ? "Move to free" : "Mark as paid"}</Button></form>
            <form action={updateClientSubscription} className="grid gap-2 sm:grid-cols-4"><input type="hidden" name="workspaceId" value={client.workspaceId} />
              <select name="plan" defaultValue={client.plan} className="h-9 rounded-md border bg-background px-2 text-xs">{["free","starter","growth","pro","enterprise"].map(plan => <option key={plan} value={plan}>{plan}</option>)}</select>
              <select name="status" defaultValue={client.subscriptionStatus} className="h-9 rounded-md border bg-background px-2 text-xs">{["free","active","past_due","cancelled"].map(status => <option key={status} value={status}>{status}</option>)}</select>
              <label className="relative"><CalendarClock className="absolute left-2 top-2.5 size-3.5 text-muted-foreground" /><input type="date" name="dueAt" defaultValue={client.subscriptionDueAt?.slice(0,10)} className="h-9 w-full rounded-md border bg-background pl-7 pr-2 text-xs" /></label>
              <Button size="sm" variant="secondary">Save details</Button>
            </form>
            <div className="flex justify-end"><Link href={`/dashboard/admin/clients/${client.workspaceId}/new-bot?email=${encodeURIComponent(client.ownerEmail)}`}><Button size="sm"><Plus className="size-4" />Enter company info & build bot</Button></Link></div>
          </div>
        </div>
      </div>)}
    </CardContent></Card>
  </div></>;
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, CircleDollarSign, MessageSquareText, Plus, Users } from "lucide-react";
import { updateBotManagement } from "./actions";
import { Topbar } from "@/components/dashboard/topbar";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isVoxAdmin } from "@/lib/admin";
import { requireSession } from "@/lib/auth/session-cookies";
import { listAdminBots } from "@/lib/repository";

export const dynamic = "force-dynamic";

const billingVariant = { paid: "success", trial: "default", unpaid: "warning", past_due: "danger", cancelled: "muted" } as const;

export default async function AdminBotsPage() {
  const session = await requireSession();
  if (!isVoxAdmin(session.email)) redirect("/dashboard");
  const bots = await listAdminBots();
  const revenue = bots.filter((bot) => bot.billingStatus === "paid").reduce((sum, bot) => sum + bot.priceCents, 0);
  const clients = new Set(bots.map((bot) => bot.workspaceId)).size;
  return <>
    <Topbar title="Bot administration" />
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Client bot fleet</h2><p className="text-sm text-muted-foreground">Create, monitor, activate and track payment for every deployed bot.</p></div><Link href="/dashboard/admin/requests"><Button size="sm"><Plus className="size-4" />Build a client bot</Button></Link></div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4"><StatCard label="Total bots" value={String(bots.length)} /><StatCard label="Active bots" value={String(bots.filter((bot) => bot.status === "active").length)} /><StatCard label="Clients" value={String(clients)} /><StatCard label="Tracked monthly revenue" value={`$${(revenue / 100).toLocaleString()}`} /></div>
      <Card><CardHeader><CardTitle>All bots</CardTitle></CardHeader><CardContent className="space-y-4">{!bots.length && <p className="text-sm text-muted-foreground">No bots have been created yet.</p>}{bots.map((bot) => <div key={bot.id} className="rounded-xl border p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className="flex min-w-0 flex-1 items-center gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent"><Bot className="size-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{bot.name}</p><Badge variant={bot.status === "active" ? "success" : "muted"}>{bot.status}</Badge><Badge variant={billingVariant[bot.billingStatus]}>{bot.billingStatus.replaceAll("_", " ")}</Badge></div><p className="truncate text-sm text-muted-foreground">{bot.workspaceName} · {bot.clientEmail}</p><div className="mt-1 flex gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1"><MessageSquareText className="size-3" />{bot.conversations} conversations</span><span className="flex items-center gap-1"><Users className="size-3" />{bot.appointments} appointments</span></div></div></div><form action={updateBotManagement} className="grid gap-2 sm:grid-cols-4 lg:w-[620px]"><input type="hidden" name="agentId" value={bot.id} /><select name="status" defaultValue={bot.status} className="h-9 rounded-md border bg-background px-2 text-xs"><option value="active">Active</option><option value="draft">Draft</option><option value="paused">Paused</option></select><select name="billingStatus" defaultValue={bot.billingStatus} className="h-9 rounded-md border bg-background px-2 text-xs">{["trial","paid","unpaid","past_due","cancelled"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select><label className="relative"><CircleDollarSign className="absolute left-2 top-2.5 size-3.5 text-muted-foreground" /><input name="monthlyPrice" type="number" min="0" step="0.01" defaultValue={(bot.priceCents/100).toFixed(2)} className="h-9 w-full rounded-md border bg-background pl-7 pr-2 text-xs" aria-label="Monthly price" /></label><input name="paidThrough" type="date" defaultValue={bot.paidThrough?.slice(0,10)} className="h-9 rounded-md border bg-background px-2 text-xs" aria-label="Paid through" /><div className="sm:col-span-4 flex justify-end gap-2"><Link href={`/dashboard/agents/${bot.id}`}><Button type="button" variant="ghost" size="sm">Open builder</Button></Link><Button type="submit" variant="secondary" size="sm">Save management</Button></div></form></div></div>)}</CardContent></Card>
    </div>
  </>;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, MessageSquare, Phone, Settings2 } from "lucide-react";
import { Topbar } from "@/components/dashboard/topbar";
import { StatCard } from "@/components/dashboard/stat-card";
import { VolumeChart, OutcomeChart } from "@/components/dashboard/charts";
import { OutcomeBadge } from "@/app/(dashboard)/dashboard/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session-cookies";
import { getAnalytics } from "@/lib/analytics";
import { getAgentById, listAppointments, listConversations } from "@/lib/repository";
import { formatNumber, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BotOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const agent = await getAgentById(id, session.workspaceId);
  if (!agent) notFound();
  const [analytics, allConversations, allAppointments] = await Promise.all([
    getAnalytics(session.workspaceId, id),
    listConversations(session.workspaceId),
    listAppointments(session.workspaceId),
  ]);
  const conversations = allConversations.filter((item) => item.agentId === id);
  const appointments = allAppointments.filter((item) => item.agentId === id);
  const { kpis } = analytics;
  return <>
    <Topbar title={agent.name} />
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><Badge variant={agent.status === "active" ? "success" : "muted"}>{agent.status}</Badge><span className="text-sm capitalize text-muted-foreground">{agent.type} bot · {agent.language}</span></div>
        <Link href={`/dashboard/agents/${agent.id}`}><Button variant="secondary" size="sm"><Settings2 className="size-4" />Configure and test</Button></Link>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Calls answered" value={formatNumber(kpis.callsAnswered)} delta={kpis.callsAnsweredDelta} />
        <StatCard label="Messages handled" value={formatNumber(kpis.chatEngagement)} delta={kpis.chatEngagementDelta} />
        <StatCard label="Appointments" value={formatNumber(appointments.length)} />
        <StatCard label="Conversion rate" value={`${kpis.conversionRate}%`} delta={kpis.conversionDelta} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Bot activity</CardTitle><p className="text-sm text-muted-foreground">Calls and messages over the last 14 days</p></CardHeader><CardContent><VolumeChart data={analytics.volume} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Conversation outcomes</CardTitle></CardHeader><CardContent><OutcomeChart data={analytics.outcomes} /></CardContent></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader className="flex-row items-center justify-between"><CardTitle>Recent conversations</CardTitle><Link href="/dashboard/conversations" className="text-sm text-primary">View all</Link></CardHeader><CardContent className="divide-y">{!conversations.length && <p className="text-sm text-muted-foreground">No conversations recorded for this bot yet.</p>}{conversations.slice(0,6).map((item) => <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0"><div className="flex size-9 items-center justify-center rounded-full bg-accent">{item.channel === "voice" ? <Phone className="size-4" /> : <MessageSquare className="size-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.contact}</p><p className="truncate text-xs text-muted-foreground">{item.summary}</p></div><div className="text-right"><OutcomeBadge outcome={item.outcome} /><p className="mt-1 text-[10px] text-muted-foreground">{timeAgo(item.startedAt)}</p></div></div>)}</CardContent></Card>
        <Card><CardHeader className="flex-row items-center justify-between"><CardTitle>Appointments</CardTitle><Link href="/dashboard/appointments" className="text-sm text-primary">Open calendar</Link></CardHeader><CardContent className="space-y-3">{!appointments.length && <p className="text-sm text-muted-foreground">No appointments booked by this bot yet.</p>}{appointments.slice(0,6).map((item) => <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3"><div className="flex size-9 items-center justify-center rounded-full bg-accent"><CalendarCheck className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.contactName}</p><p className="text-xs text-muted-foreground">{item.service} · {new Date(item.startsAt).toLocaleDateString()}</p></div><Badge variant={item.status === "confirmed" ? "success" : "muted"}>{item.status}</Badge></div>)}</CardContent></Card>
      </div>
    </div>
  </>;
}

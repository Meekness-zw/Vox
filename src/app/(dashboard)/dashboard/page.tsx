import Link from "next/link";
import { Phone, MessageSquare } from "lucide-react";
import { Topbar } from "@/components/dashboard/topbar";
import { StatCard } from "@/components/dashboard/stat-card";
import { SystemStatus } from "@/components/dashboard/system-status";
import { VolumeChart, OutcomeChart } from "@/components/dashboard/charts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listConversations } from "@/lib/repository";
import { getAnalytics } from "@/lib/analytics";
import { getSession } from "@/lib/auth/session-cookies";
import { formatNumber, timeAgo } from "@/lib/utils";

const channelIcon = {
  voice: Phone,
  chat: MessageSquare,
  sms: MessageSquare,
  whatsapp: MessageSquare,
} as const;

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const session = await getSession();
  const [conversations, analytics] = await Promise.all([
    listConversations(session?.workspaceId),
    getAnalytics(session?.workspaceId),
  ]);
  const { kpis, volume, outcomes } = analytics;
  return (
    <>
      <Topbar title="Overview" />
      <div className="space-y-6 p-4 sm:p-6">
        {/* KPI row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Calls answered"
            value={formatNumber(kpis.callsAnswered)}
            delta={kpis.callsAnsweredDelta}
          />
          <StatCard
            label="Conversion rate"
            value={`${kpis.conversionRate}%`}
            delta={kpis.conversionDelta}
          />
          <StatCard
            label="Appointments booked"
            value={formatNumber(kpis.appointmentsBooked)}
            delta={kpis.appointmentsDelta}
          />
          <StatCard
            label="Avg. call duration"
            value={`${Math.floor(kpis.avgDurationSec / 60)}m ${kpis.avgDurationSec % 60}s`}
            delta={kpis.avgDurationDelta}
            invertDelta
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Volume chart */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Conversation volume</CardTitle>
                <p className="text-sm text-muted-foreground">Last 14 days</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-primary" /> Calls
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[#b9a6ff]" /> Chats
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <VolumeChart data={volume} />
            </CardContent>
          </Card>

          {/* Outcomes */}
          <Card>
            <CardHeader>
              <CardTitle>Outcomes</CardTitle>
              <p className="text-sm text-muted-foreground">This month</p>
            </CardHeader>
            <CardContent>
              <OutcomeChart data={outcomes} />
              <ul className="mt-4 space-y-2">
                {outcomes.map((o) => (
                  <li key={o.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: o.color }}
                      />
                      {o.name}
                    </span>
                    <span className="font-medium">{formatNumber(o.value)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Secondary KPIs + recent activity */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-1 lg:grid-cols-1">
            <StatCard
              label="Chat engagement"
              value={formatNumber(kpis.chatEngagement)}
              delta={kpis.chatEngagementDelta}
            />
            <StatCard
              label="Customer satisfaction"
              value={kpis.csat.toFixed(1)}
              suffix="/ 5"
              delta={kpis.csatDelta}
            />
            <StatCard
              label="Agent utilization"
              value={`${kpis.agentUtilization}%`}
              delta={kpis.agentUtilizationDelta}
            />
          </div>

          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Recent conversations</CardTitle>
              <Link
                href="/dashboard/conversations"
                className="text-sm text-primary hover:underline"
              >
                View all
              </Link>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {conversations.slice(0, 5).map((c) => {
                const Icon = channelIcon[c.channel];
                return (
                  <Link
                    key={c.id}
                    href="/dashboard/conversations"
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {c.contact}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {c.summary}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <OutcomeBadge outcome={c.outcome} />
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(c.startedAt)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <SystemStatus />
      </div>
    </>
  );
}

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, { label: string; variant: "success" | "default" | "warning" | "danger" | "muted" }> = {
    booked: { label: "Booked", variant: "success" },
    lead: { label: "Lead", variant: "default" },
    answered: { label: "Resolved", variant: "muted" },
    transferred: { label: "Transferred", variant: "warning" },
    missed: { label: "Missed", variant: "danger" },
  };
  const o = map[outcome] ?? { label: outcome, variant: "muted" as const };
  return <Badge variant={o.variant}>{o.label}</Badge>;
}

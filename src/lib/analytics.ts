import { sql } from "@/lib/db";
import {
  kpis as mockKpis,
  callVolumeSeries as mockSeries,
  outcomeBreakdown as mockOutcomes,
} from "@/lib/data";

export type Kpis = {
  callsAnswered: number;
  callsAnsweredDelta?: number;
  conversionRate: number;
  conversionDelta?: number;
  appointmentsBooked: number;
  appointmentsDelta?: number;
  avgDurationSec: number;
  avgDurationDelta?: number;
  chatEngagement: number;
  chatEngagementDelta?: number;
  csat: number;
  csatDelta?: number;
  agentUtilization: number;
  agentUtilizationDelta?: number;
};

export type Analytics = {
  live: boolean;
  kpis: Kpis;
  volume: { day: string; calls: number; chats: number }[];
  outcomes: { name: string; value: number; color: string }[];
};

type Row = {
  started_at: Date | string;
  channel: string;
  outcome: string;
  duration_sec: number;
  sentiment: string;
};

const DAY = 86_400_000;
const OUTCOME_META: { key: string; name: string; color: string }[] = [
  { key: "booked", name: "Appointments booked", color: "#6d4aff" },
  { key: "lead", name: "Leads captured", color: "#8b6dff" },
  { key: "answered", name: "Answered / resolved", color: "#b9a6ff" },
  { key: "transferred", name: "Transferred", color: "#d8ccff" },
];

const pctChange = (cur: number, prev: number) =>
  prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : undefined;

function computeKpis(rows: Row[]) {
  const voice = rows.filter((r) => r.channel === "voice");
  const chats = rows.filter((r) => r.channel !== "voice");
  const total = rows.length;
  const booked = rows.filter((r) => r.outcome === "booked").length;
  const transferred = rows.filter((r) => r.outcome === "transferred").length;
  const answeredVoice = voice.filter((r) => r.outcome !== "missed");
  const avgDur =
    answeredVoice.length > 0
      ? Math.round(
          answeredVoice.reduce((s, r) => s + Number(r.duration_sec), 0) /
            answeredVoice.length
        )
      : 0;
  const sentimentScore = (s: string) =>
    s === "positive" ? 5 : s === "negative" ? 2 : 4;
  const csat =
    total > 0
      ? Math.round(
          (rows.reduce((s, r) => s + sentimentScore(r.sentiment), 0) / total) * 10
        ) / 10
      : 0;
  return {
    callsAnswered: answeredVoice.length,
    conversionRate: total > 0 ? Math.round((booked / total) * 1000) / 10 : 0,
    appointmentsBooked: booked,
    avgDurationSec: avgDur,
    chatEngagement: chats.length,
    csat,
    agentUtilization:
      total > 0 ? Math.round(((total - transferred) / total) * 100) : 0,
  };
}

export async function getAnalytics(workspaceId = "ws_demo", agentId?: string): Promise<Analytics> {
  if (!sql) {
    const rows = mockSeries;
    return {
      live: false,
      kpis: mockKpis,
      volume: rows,
      outcomes: mockOutcomes,
    };
  }

  const since = new Date(Date.now() - 28 * DAY).toISOString();
  const rows = (agentId
    ? await sql`
        select started_at, channel, outcome, duration_sec, sentiment
        from conversations where workspace_id = ${workspaceId}
          and agent_id = ${agentId} and started_at >= ${since}
      `
    : await sql`
        select started_at, channel, outcome, duration_sec, sentiment
        from conversations where workspace_id = ${workspaceId} and started_at >= ${since}
      `) as unknown as Row[];

  const now = Date.now();
  const inWindow = (r: Row, startDaysAgo: number, endDaysAgo: number) => {
    const t = new Date(r.started_at).getTime();
    return t >= now - startDaysAgo * DAY && t < now - endDaysAgo * DAY;
  };
  const current = rows.filter((r) => inWindow(r, 14, 0));
  const prior = rows.filter((r) => inWindow(r, 28, 14));

  const cur = computeKpis(current);
  const prev = computeKpis(prior);

  const kpis: Kpis = {
    ...cur,
    callsAnsweredDelta: pctChange(cur.callsAnswered, prev.callsAnswered),
    conversionDelta: pctChange(cur.conversionRate, prev.conversionRate),
    appointmentsDelta: pctChange(cur.appointmentsBooked, prev.appointmentsBooked),
    avgDurationDelta: pctChange(cur.avgDurationSec, prev.avgDurationSec),
    chatEngagementDelta: pctChange(cur.chatEngagement, prev.chatEngagement),
    csatDelta: pctChange(cur.csat, prev.csat),
    agentUtilizationDelta: pctChange(cur.agentUtilization, prev.agentUtilization),
  };

  // 14-day volume series
  const volume: Analytics["volume"] = [];
  for (let i = 13; i >= 0; i--) {
    const dayStart = now - (i + 1) * DAY;
    const dayEnd = now - i * DAY;
    const dayRows = rows.filter((r) => {
      const t = new Date(r.started_at).getTime();
      return t >= dayStart && t < dayEnd;
    });
    volume.push({
      day: new Date(dayEnd).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      calls: dayRows.filter((r) => r.channel === "voice").length,
      chats: dayRows.filter((r) => r.channel !== "voice").length,
    });
  }

  const outcomes = OUTCOME_META.map((o) => ({
    name: o.name,
    color: o.color,
    value: current.filter((r) => r.outcome === o.key).length,
  }));

  return { live: true, kpis, volume, outcomes };
}

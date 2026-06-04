"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type VolumePoint = { day: string; calls: number; chats: number };
type OutcomePoint = { name: string; value: number; color: string };

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--card-foreground)",
  fontSize: 12,
};

export function VolumeChart({ data }: { data: VolumePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="calls" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6d4aff" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#6d4aff" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="chats" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b9a6ff" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#b9a6ff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          interval={1}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          width={36}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Area
          type="monotone"
          dataKey="chats"
          name="Chats"
          stroke="#b9a6ff"
          strokeWidth={2}
          fill="url(#chats)"
        />
        <Area
          type="monotone"
          dataKey="calls"
          name="Calls"
          stroke="#6d4aff"
          strokeWidth={2}
          fill="url(#calls)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function OutcomeChart({ data }: { data: OutcomePoint[] }) {
  const hasData = data.some((d) => d.value > 0);
  if (!hasData) {
    return (
      <div className="flex h-[240px] items-center justify-center text-center text-sm text-muted-foreground">
        No outcomes yet — they&apos;ll appear as conversations come in.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={58}
          outerRadius={88}
          paddingAngle={2}
          stroke="var(--card)"
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}

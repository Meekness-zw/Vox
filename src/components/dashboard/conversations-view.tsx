"use client";

import { useState } from "react";
import { Phone, MessageSquare, FileText, ListChecks, Smile, Meh, Frown } from "lucide-react";
import type { Conversation } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn, timeAgo } from "@/lib/utils";

const channelIcon = {
  voice: Phone,
  chat: MessageSquare,
  sms: MessageSquare,
  whatsapp: MessageSquare,
} as const;

const sentimentIcon = { positive: Smile, neutral: Meh, negative: Frown } as const;
const sentimentColor = {
  positive: "text-success",
  neutral: "text-muted-foreground",
  negative: "text-danger",
} as const;

const outcomeVariant: Record<
  Conversation["outcome"],
  "success" | "default" | "warning" | "danger" | "muted"
> = {
  booked: "success",
  lead: "default",
  answered: "muted",
  transferred: "warning",
  missed: "danger",
};

function fmtDuration(sec: number) {
  if (sec === 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function ConversationsView({ conversations }: { conversations: Conversation[] }) {
  const [selectedId, setSelectedId] = useState(conversations[0]?.id);
  const selected = conversations.find((c) => c.id === selectedId);

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* List */}
      <div className="space-y-2">
        {conversations.map((c) => {
          const Icon = channelIcon[c.channel];
          return (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition-colors",
                selectedId === c.id
                  ? "border-primary bg-accent/40"
                  : "border-border bg-card hover:bg-muted"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="size-4 text-muted-foreground" />
                  {c.contact}
                </span>
                <Badge variant={outcomeVariant[c.outcome]}>{c.outcome}</Badge>
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                {c.summary}
              </p>
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="capitalize">{c.channel}</span>
                <span>·</span>
                <span>{fmtDuration(c.durationSec)}</span>
                <span>·</span>
                <span>{timeAgo(c.startedAt)}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail */}
      {selected ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{selected.contact}</h2>
                <p className="text-sm capitalize text-muted-foreground">
                  {selected.channel} · {fmtDuration(selected.durationSec)} ·{" "}
                  {timeAgo(selected.startedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Sentiment value={selected.sentiment} />
                <Badge variant={outcomeVariant[selected.outcome]}>
                  {selected.outcome}
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="size-4 text-primary" /> Summary
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {selected.summary}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <ListChecks className="size-4 text-primary" /> Action items
              </h3>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                {selected.actionItems.map((a, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold">Transcript</h3>
            {selected.transcript.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No transcript was recorded for this conversation.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {selected.transcript.map((t, i) => (
                  <div
                    key={i}
                    className={
                      t.role === "agent" ? "flex justify-start" : "flex justify-end"
                    }
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
                        t.role === "agent"
                          ? "rounded-tl-sm bg-muted"
                          : "rounded-tr-sm bg-primary text-primary-foreground"
                      )}
                    >
                      {t.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-10 text-sm text-muted-foreground">
          Select a conversation to view details
        </div>
      )}
    </div>
  );
}

function Sentiment({ value }: { value: Conversation["sentiment"] }) {
  const Icon = sentimentIcon[value];
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs font-medium capitalize",
        sentimentColor[value]
      )}
    >
      <Icon className="size-4" />
      {value}
    </span>
  );
}

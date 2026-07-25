"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Loader2, X } from "lucide-react";
import type { Appointment } from "@/lib/types";
import { cancelAppointmentAction } from "@/app/(dashboard)/dashboard/appointments/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, timeAgo } from "@/lib/utils";

const statusVariant: Record<Appointment["status"], "success" | "danger" | "muted" | "warning"> = {
  confirmed: "success",
  cancelled: "danger",
  completed: "muted",
  no_show: "warning",
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AppointmentsView({ appointments }: { appointments: Appointment[] }) {
  const [selectedId, setSelectedId] = useState(appointments[0]?.id);
  const [pending, startTransition] = useTransition();
  const selected = appointments.find((a) => a.id === selectedId);

  if (appointments.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-10 text-sm text-muted-foreground">
        No appointments yet — they&apos;ll show up here as soon as your agents
        book one over the phone, chat, or WhatsApp.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="space-y-2">
        {appointments.map((a) => (
          <button
            key={a.id}
            onClick={() => setSelectedId(a.id)}
            className={cn(
              "w-full rounded-lg border p-3 text-left transition-colors",
              selectedId === a.id
                ? "border-primary bg-accent/40"
                : "border-border bg-card hover:bg-muted"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <CalendarClock className="size-4 text-muted-foreground" />
                {a.contactName}
              </span>
              <Badge variant={statusVariant[a.status]}>{a.status}</Badge>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{a.service}</p>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              <span>{fmtDateTime(a.startsAt)}</span>
              <span>·</span>
              <span>{timeAgo(a.createdAt)}</span>
            </div>
          </button>
        ))}
      </div>

      {selected ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{selected.contactName}</h2>
                <p className="text-sm text-muted-foreground">
                  {selected.service} · {fmtDateTime(selected.startsAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant[selected.status]}>{selected.status}</Badge>
                {selected.status === "confirmed" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(() => {
                        cancelAppointmentAction(selected.id);
                      })
                    }
                  >
                    {pending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold">Contact</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {selected.contactPhone ?? "—"}
                {selected.contactEmail ? ` · ${selected.contactEmail}` : ""}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold">Calendar sync</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {selected.googleEventId
                  ? "Synced to Google Calendar"
                  : "Not synced — connect Google Calendar in Settings to sync automatically."}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-10 text-sm text-muted-foreground">
          Select an appointment to view details
        </div>
      )}
    </div>
  );
}

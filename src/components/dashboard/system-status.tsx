import { getSystemStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

export function SystemStatus({ className }: { className?: string }) {
  const services = getSystemStatus();
  return (
    <div
      className={cn(
        "grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3",
        className
      )}
    >
      {services.map((s) => (
        <div key={s.key} className="flex items-start gap-2.5">
          <span
            className={cn(
              "mt-1 size-2 shrink-0 rounded-full",
              s.connected ? "bg-success" : "bg-amber-400"
            )}
          />
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {s.label}{" "}
              <span
                className={cn(
                  "text-xs font-normal",
                  s.connected ? "text-success" : "text-muted-foreground"
                )}
              >
                {s.connected ? "· connected" : "· demo"}
              </span>
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {s.detail}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  delta,
  suffix,
  invertDelta = false,
}: {
  label: string;
  value: string;
  delta?: number;
  suffix?: string;
  /** when true, a negative delta is "good" (e.g. avg call duration) */
  invertDelta?: boolean;
}) {
  const positive = delta === undefined ? true : invertDelta ? delta < 0 : delta >= 0;
  return (
    <Card className="p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-end justify-between">
        <div className="text-2xl font-semibold tracking-tight">
          {value}
          {suffix && (
            <span className="ml-1 text-base font-normal text-muted-foreground">
              {suffix}
            </span>
          )}
        </div>
        {delta !== undefined && (
          <div
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium",
              positive ? "text-success" : "text-danger"
            )}
          >
            {delta >= 0 ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {Math.abs(delta)}%
          </div>
        )}
      </div>
    </Card>
  );
}

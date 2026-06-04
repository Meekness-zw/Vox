"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { plans } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PlanSwitcher({ currentPlanId }: { currentPlanId: string }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function choose(planId: string) {
    setNotice(null);
    if (planId === "enterprise") {
      setNotice("Our team will reach out to set up Enterprise pricing.");
      return;
    }
    setLoading(planId);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setNotice(
        data.message ??
          "Stripe isn't configured in this environment yet — see the README to connect billing."
      );
    } catch {
      setNotice("Something went wrong starting checkout. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          return (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col rounded-xl border bg-card p-5",
                isCurrent ? "border-primary ring-1 ring-primary" : "border-border"
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{plan.name}</h3>
                {isCurrent && <Badge variant="success">Current</Badge>}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-bold">{plan.priceLabel}</span>
                {plan.price !== null && (
                  <span className="text-xs text-muted-foreground">/mo</span>
                )}
              </div>
              <ul className="mt-4 flex-1 space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 text-primary" /> {plan.limits.agents}
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 text-primary" /> {plan.limits.voiceMinutes}
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 text-primary" /> {plan.limits.chatConversations}
                </li>
              </ul>
              <Button
                className="mt-4 w-full"
                variant={isCurrent ? "secondary" : "primary"}
                disabled={isCurrent || loading === plan.id}
                onClick={() => choose(plan.id)}
              >
                {loading === plan.id && <Loader2 className="size-4 animate-spin" />}
                {isCurrent
                  ? "Current plan"
                  : plan.id === "enterprise"
                    ? "Contact sales"
                    : "Switch plan"}
              </Button>
            </div>
          );
        })}
      </div>
      {notice && (
        <p className="mt-4 rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </div>
  );
}

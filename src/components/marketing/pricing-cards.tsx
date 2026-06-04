import Link from "next/link";
import { Check } from "lucide-react";
import { plans } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PricingCards() {
  return (
    <div className="grid gap-6 lg:grid-cols-4">
      {plans.map((plan) => (
        <div
          key={plan.id}
          className={cn(
            "relative flex flex-col rounded-2xl border bg-card p-6",
            plan.highlighted
              ? "border-primary shadow-lg ring-1 ring-primary"
              : "border-border"
          )}
        >
          {plan.highlighted && (
            <Badge className="absolute -top-3 left-6">Most popular</Badge>
          )}
          <h3 className="text-lg font-semibold">{plan.name}</h3>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-4xl font-bold tracking-tight">
              {plan.priceLabel}
            </span>
            {plan.price !== null && (
              <span className="text-sm text-muted-foreground">/month</span>
            )}
          </div>
          <p className="mt-3 min-h-10 text-sm text-muted-foreground">
            {plan.tagline}
          </p>

          <Link
            href={plan.id === "enterprise" ? "#contact" : "/signup"}
            className="mt-5"
          >
            <Button
              className="w-full"
              variant={plan.highlighted ? "primary" : "secondary"}
            >
              {plan.cta}
            </Button>
          </Link>

          <ul className="mt-6 space-y-3 text-sm">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

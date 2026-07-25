"use client";

import { useActionState } from "react";
import { Loader2, Send } from "lucide-react";
import { submitBotRequest } from "@/app/(dashboard)/dashboard/request-bot/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

export function BotRequestForm() {
  const [state, action, pending] = useActionState(submitBotRequest, {});
  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" name="businessName" placeholder="e.g. Moyo Auto Care" />
        <Field label="Industry" name="industry" placeholder="e.g. Motor repairs" />
      </div>
      <Area label="Tell us about the business" name="description" placeholder="What you do, who you serve, locations, and anything customers should know." />
      <Area label="Services and prices" name="services" placeholder="List each service, price or price range, and useful conditions." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business hours" name="businessHours" placeholder="Mon–Fri 8am–5pm, Sat 8am–1pm" />
        <Field label="Languages" name="languages" placeholder="English + Shona code-switching" />
        <Field label="Bot personality" name="tone" placeholder="Warm, local, patient, professional" />
        <Field label="Human handoff rule" name="escalation" placeholder="Transfer urgent requests to +263…" />
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Where should the bot work?</legend>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          {["WhatsApp", "Website chat", "Phone calls", "SMS"].map((channel) => (
            <label key={channel} className="flex items-center gap-2">
              <input type="checkbox" name="channels" value={channel} defaultChecked={channel === "WhatsApp"} />
              {channel}
            </label>
          ))}
        </div>
      </fieldset>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Send to Vox for review
      </Button>
    </form>
  );
}

function Field({ label, name, placeholder }: { label: string; name: string; placeholder: string }) {
  return <div className="space-y-1.5"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} placeholder={placeholder} required /></div>;
}
function Area({ label, name, placeholder }: { label: string; name: string; placeholder: string }) {
  return <div className="space-y-1.5"><Label htmlFor={name}>{label}</Label><Textarea id={name} name={name} placeholder={placeholder} rows={4} required /></div>;
}

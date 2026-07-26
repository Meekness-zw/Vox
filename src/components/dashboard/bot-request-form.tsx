"use client";

import { useActionState, useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { submitBotRequest } from "@/app/(dashboard)/dashboard/request-bot/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

export function BotRequestForm() {
  const [state, action, pending] = useActionState(submitBotRequest, {});
  const [schedule, setSchedule] = useState([
    ...["Monday","Tuesday","Wednesday","Thursday","Friday"].map(day => ({ day, enabled: true, opens: "08:00", closes: "17:00" })),
    { day: "Saturday", enabled: false, opens: "08:00", closes: "13:00" },
    { day: "Sunday", enabled: false, opens: "08:00", closes: "13:00" },
  ]);
  const hours = useMemo(() => schedule.map(s => s.enabled ? `${s.day} ${s.opens}–${s.closes}` : `${s.day} closed`).join(", "), [schedule]);
  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" name="businessName" placeholder="e.g. Moyo Auto Care" />
        <Field label="Industry" name="industry" placeholder="e.g. Motor repairs" />
      </div>
      <Area label="Tell us about the business" name="description" placeholder="What you do, who you serve, locations, and anything customers should know." />
      <Area label="Services and prices" name="services" placeholder="List each service, price or price range, and useful conditions." />
      <input type="hidden" name="businessHours" value={hours} />
      <input type="hidden" name="businessSchedule" value={JSON.stringify(schedule)} />
      <div className="space-y-3"><Label>Business days and hours</Label>
        <div className="divide-y rounded-lg border">{schedule.map((s, index) => <div key={s.day} className="grid grid-cols-[120px_1fr_1fr] items-center gap-3 p-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.enabled} onChange={e => setSchedule(v => v.map((x,i) => i===index ? {...x,enabled:e.target.checked}:x))} />{s.day}</label>
          <input type="time" value={s.opens} disabled={!s.enabled} onChange={e => setSchedule(v => v.map((x,i) => i===index ? {...x,opens:e.target.value}:x))} className="rounded-md border bg-background px-2 py-1.5 text-sm" />
          <input type="time" value={s.closes} disabled={!s.enabled} onChange={e => setSchedule(v => v.map((x,i) => i===index ? {...x,closes:e.target.value}:x))} className="rounded-md border bg-background px-2 py-1.5 text-sm" />
        </div>)}</div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <PhoneField name="companyPhone" label="Public company number" />
        <PhoneField name="transferPhone" label="Human transfer number" />
        <PhoneField name="whatsappPhone" label="WhatsApp business number" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
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

const codes = [["ZW","+263"],["ZA","+27"],["BW","+267"],["ZM","+260"],["MZ","+258"],["GB","+44"],["US/CA","+1"]];
function PhoneField({ name, label }: { name: string; label: string }) {
  const [code, setCode] = useState("+263");
  const [number, setNumber] = useState("");
  return <div className="space-y-1.5"><Label>{label}</Label><div className="flex gap-2">
    <select value={code} onChange={e => setCode(e.target.value)} className="rounded-md border bg-background px-2 text-sm">{codes.map(([country,c]) => <option key={country} value={c}>{country} {c}</option>)}</select>
    <Input value={number} onChange={e => setNumber(e.target.value.replace(/\D/g,""))} inputMode="tel" placeholder="771234567" required />
    <input type="hidden" name={name} value={`${code}${number}`} />
  </div></div>;
}

function Field({ label, name, placeholder }: { label: string; name: string; placeholder: string }) {
  return <div className="space-y-1.5"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} placeholder={placeholder} required /></div>;
}
function Area({ label, name, placeholder }: { label: string; name: string; placeholder: string }) {
  return <div className="space-y-1.5"><Label htmlFor={name}>{label}</Label><Textarea id={name} name={name} placeholder={placeholder} rows={4} required /></div>;
}

import { Topbar } from "@/components/dashboard/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/dashboard/stat-card";
import { requireSession } from "@/lib/auth/session-cookies";
import { listSmsMessages } from "@/lib/repository";
import { sendSms } from "./actions";

export const dynamic = "force-dynamic";

export default async function SmsPage() {
  const session = await requireSession();
  const messages = await listSmsMessages(session.workspaceId);
  const sent = messages.filter((m) => m.status !== "failed").length;
  const failed = messages.filter((m) => m.status === "failed").length;
  return <><Topbar title="SMS Messaging" /><div className="space-y-6 p-4 sm:p-6">
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Messages recorded" value={String(messages.length)} />
      <StatCard label="Accepted by Twilio" value={String(sent)} />
      <StatCard label="Failed" value={String(failed)} />
      <StatCard label="Success rate" value={`${messages.length ? Math.round(sent/messages.length*100) : 0}%`} />
    </div>
    <Card><CardHeader><CardTitle>Send a message</CardTitle><p className="text-sm text-muted-foreground">Use international format, for example +263…</p></CardHeader>
      <CardContent><form action={sendSms} className="space-y-3"><Input name="to" placeholder="+263…" required />
        <textarea name="body" maxLength={1500} required placeholder="Message" className="min-h-28 w-full rounded-lg border bg-background p-3 text-sm" />
        <Button>Send SMS</Button></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Delivery history</CardTitle></CardHeader><CardContent className="p-0">
      <div className="divide-y">{messages.length ? messages.map((m) => <div key={String(m.id)} className="grid gap-2 px-5 py-4 text-sm sm:grid-cols-[160px_1fr_110px]">
        <div><div className="font-medium">{String(m.to_number)}</div><div className="text-xs text-muted-foreground">{new Date(m.created_at as Date).toLocaleString()}</div></div>
        <div><p>{String(m.body)}</p>{m.error_message && <p className="mt-1 text-xs text-danger">{String(m.error_message)}</p>}</div>
        <Badge variant={m.status === "failed" ? "muted" : "success"}>{String(m.status)}</Badge>
      </div>) : <p className="p-6 text-sm text-muted-foreground">No SMS messages sent yet.</p>}</div>
    </CardContent></Card>
  </div></>;
}

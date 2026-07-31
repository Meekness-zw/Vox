import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Hammer } from "lucide-react";
import { buildRequestedBot, provisionClientNumbers, purchaseClientVoiceNumber, refreshClientWhatsAppSender, startClientWhatsAppOnboarding, updateClientBusinessSchedule, updateRequestWorkflow, verifyClientWhatsAppSender } from "../actions";
import { Topbar } from "@/components/dashboard/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { BusinessScheduleFields } from "@/components/dashboard/business-schedule-fields";
import { isVoxAdmin } from "@/lib/admin";
import { requireSession } from "@/lib/auth/session-cookies";
import { getAdminBotRequest } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function AdminRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!isVoxAdmin(session.email)) redirect("/dashboard");
  const request = await getAdminBotRequest((await params).id);
  if (!request) notFound();
  const fields = [
    ["Industry", request.industry], ["About", request.description],
    ["Services and prices", request.services], ["Hours", request.businessHours],
    ["Public company number", request.companyPhone], ["Human transfer number", request.transferPhone],
    ["WhatsApp number", request.whatsappPhone], ["Languages", request.languages],
    ["Tone", request.tone], ["Channels", request.channels.join(", ")],
    ["Escalation", request.escalation],
  ];
  return <><Topbar title={request.businessName} /><div className="space-y-5 p-4 sm:p-6">
    <Link href="/dashboard/admin/requests" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="size-4" />Build queue</Link>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card><CardHeader><div className="flex items-center justify-between"><CardTitle>Client brief</CardTitle><Badge>{request.status.replaceAll("_", " ")}</Badge></div><p className="text-sm text-muted-foreground">Submitted by {request.contactName} · {request.contactEmail}</p></CardHeader>
        <CardContent className="space-y-4">{fields.map(([label, value]) => <div key={label}><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm">{value || "—"}</p></div>)}</CardContent>
      </Card>
      <div className="space-y-4">
        <Card><CardHeader><CardTitle>Booking schedule</CardTitle><p className="text-sm text-muted-foreground">These exact days, hours and timezone control which appointments the bot may offer.</p></CardHeader><CardContent><form action={updateClientBusinessSchedule} className="space-y-4"><input type="hidden" name="id" value={request.id} /><BusinessScheduleFields initialSchedule={request.businessSchedule} initialTimezone={request.timezone} /><Button className="w-full" variant="secondary">Save booking schedule</Button></form></CardContent></Card>
        <Card><CardHeader><CardTitle>Build and test</CardTitle></CardHeader><CardContent className="space-y-3">
          {request.agentId ? <Link href={`/dashboard/agents/${request.agentId}`}><Button className="w-full"><ExternalLink className="size-4" />Open bot test studio</Button></Link> : <form action={buildRequestedBot}><input type="hidden" name="id" value={request.id} /><Button className="w-full"><Hammer className="size-4" />Generate with Python</Button></form>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Voice phone number</CardTitle><p className="text-sm text-muted-foreground">Connect a number already in Vox Twilio, or purchase a new available number for this client.</p></CardHeader><CardContent className="space-y-5">
          {request.routingPhone && <div className="rounded-md bg-accent px-3 py-2 text-sm">Assigned: <span className="font-medium">{request.routingPhone}</span></div>}
          <form action={provisionClientNumbers} className="space-y-3"><input type="hidden" name="id" value={request.id} /><Label htmlFor="routingPhone">Existing Twilio number</Label><Input id="routingPhone" name="routingPhone" placeholder="+1…" defaultValue={request.routingPhone} required /><Button className="w-full" variant="secondary">Connect existing number</Button><p className="text-xs text-muted-foreground">The number must already belong to the Vox Twilio account.</p></form>
          {!request.routingPhone && <div className="border-t pt-4"><form action={purchaseClientVoiceNumber} className="space-y-3"><input type="hidden" name="id" value={request.id} /><div className="grid grid-cols-2 gap-2"><div><Label htmlFor="country">Number country</Label><select id="country" name="country" defaultValue="US" className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="US">United States</option><option value="CA">Canada</option><option value="GB">United Kingdom</option><option value="AU">Australia</option></select></div><div><Label htmlFor="areaCode">Area code (optional)</Label><Input id="areaCode" name="areaCode" inputMode="numeric" placeholder="949" /></div></div><Button className="w-full" variant="primary">Purchase and connect number</Button><p className="text-xs text-muted-foreground">This immediately purchases the first matching number and adds its recurring Twilio charge.</p></form></div>}
        </CardContent></Card>
        <Card><CardHeader><div className="flex items-center justify-between gap-2"><CardTitle>WhatsApp sender</CardTitle><Badge variant={request.whatsappSenderStatus?.toUpperCase() === "ONLINE" ? "success" : "muted"}>{request.whatsappSenderStatus || "not registered"}</Badge></div><p className="text-sm text-muted-foreground">Register the client’s number with their Meta WABA, verify the OTP, then Vox connects the webhook and bot route.</p></CardHeader><CardContent className="space-y-5">
          <div className="rounded-md bg-accent px-3 py-2 text-sm">Client number: <span className="font-medium">{request.whatsappPhone || "Not supplied"}</span></div>
          {!request.whatsappSenderSid ? <form action={startClientWhatsAppOnboarding} className="space-y-3"><input type="hidden" name="id" value={request.id} /><div><Label htmlFor="wabaId">Meta WABA ID</Label><Input id="wabaId" name="wabaId" inputMode="numeric" required /></div><div><Label htmlFor="verificationMethod">Send OTP by</Label><select id="verificationMethod" name="verificationMethod" className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="sms">SMS</option><option value="voice">Voice call</option></select></div><Button className="w-full" variant="secondary">Start WhatsApp registration</Button></form> : <><p className="break-all text-xs text-muted-foreground">Sender SID: {request.whatsappSenderSid}</p><form action={verifyClientWhatsAppSender} className="space-y-3"><input type="hidden" name="id" value={request.id} /><Label htmlFor="verificationCode">Meta verification code</Label><Input id="verificationCode" name="verificationCode" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit OTP" required /><Button className="w-full" variant="secondary">Verify OTP</Button></form><form action={refreshClientWhatsAppSender}><input type="hidden" name="id" value={request.id} /><Button className="w-full" variant="outline">Refresh approval and connect</Button></form></>}
          <form action={refreshClientWhatsAppSender} className="space-y-3 border-t pt-4"><input type="hidden" name="id" value={request.id} /><Label htmlFor="senderSid">Already-approved Twilio sender SID</Label><Input id="senderSid" name="senderSid" placeholder="XE…" defaultValue={request.whatsappSenderSid} /><Button className="w-full" variant="ghost">Connect approved sender</Button></form>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Workflow decision</CardTitle></CardHeader><CardContent>
          <form action={updateRequestWorkflow} className="space-y-3"><input type="hidden" name="id" value={request.id} /><div><Label htmlFor="adminNotes">Client-visible update</Label><Textarea id="adminNotes" name="adminNotes" defaultValue={request.adminNotes} rows={3} /></div><select name="status" defaultValue={request.status} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{["under_review","testing","changes_requested","approved","live"].map(status => <option key={status} value={status}>{status.replaceAll("_"," ")}</option>)}</select><Button variant="secondary" className="w-full">Save workflow status</Button></form>
        </CardContent></Card>
      </div>
    </div>
  </div></>;
}

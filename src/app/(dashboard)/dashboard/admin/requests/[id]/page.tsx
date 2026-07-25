import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Hammer, ExternalLink } from "lucide-react";
import { buildRequestedBot, updateRequestWorkflow } from "../actions";
import { Topbar } from "@/components/dashboard/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/input";
import { isVoxAdmin } from "@/lib/admin";
import { requireSession } from "@/lib/auth/session-cookies";
import { getBotRequest } from "@/lib/repository";

export const dynamic = "force-dynamic";
export default async function AdminRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!isVoxAdmin(session.email)) redirect("/dashboard");
  const request = await getBotRequest((await params).id);
  if (!request) notFound();
  const fields = [["Industry", request.industry], ["About", request.description], ["Services and prices", request.services], ["Hours", request.businessHours], ["Languages", request.languages], ["Tone", request.tone], ["Channels", request.channels.join(", ")], ["Escalation", request.escalation]];
  return <><Topbar title={request.businessName} /><div className="space-y-5 p-4 sm:p-6"><Link href="/dashboard/admin/requests" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="size-4" />Build queue</Link><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]"><Card><CardHeader><div className="flex items-center justify-between"><CardTitle>Client brief</CardTitle><Badge>{request.status.replaceAll("_", " ")}</Badge></div><p className="text-sm text-muted-foreground">Submitted by {request.contactName} · {request.contactEmail}</p></CardHeader><CardContent className="space-y-4">{fields.map(([label, value]) => <div key={label}><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm">{value || "—"}</p></div>)}</CardContent></Card><div className="space-y-4"><Card><CardHeader><CardTitle>Build and test</CardTitle></CardHeader><CardContent className="space-y-3">{request.agentId ? <Link href={`/dashboard/agents/${request.agentId}`}><Button className="w-full"><ExternalLink className="size-4" />Open bot test studio</Button></Link> : <form action={buildRequestedBot}><input type="hidden" name="id" value={request.id} /><Button className="w-full"><Hammer className="size-4" />Generate with Python</Button></form>}<p className="text-xs text-muted-foreground">Generation creates a draft agent and private knowledge source in the client workspace.</p></CardContent></Card><Card><CardHeader><CardTitle>Workflow decision</CardTitle></CardHeader><CardContent><form action={updateRequestWorkflow} className="space-y-3"><input type="hidden" name="id" value={request.id} /><div><Label htmlFor="adminNotes">Client-visible update</Label><Textarea id="adminNotes" name="adminNotes" defaultValue={request.adminNotes} rows={3} /></div><select name="status" defaultValue={request.status} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{["under_review", "testing", "changes_requested", "approved", "live"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select><Button variant="secondary" className="w-full">Save workflow status</Button></form></CardContent></Card></div></div></div></>;
}

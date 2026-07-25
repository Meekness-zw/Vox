import { CheckCircle2, Clock3 } from "lucide-react";
import { Topbar } from "@/components/dashboard/topbar";
import { BotRequestForm } from "@/components/dashboard/bot-request-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth/session-cookies";
import { listBotRequests } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function RequestBotPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const session = await requireSession();
  const requests = await listBotRequests(session.workspaceId);
  const submitted = (await searchParams).submitted === "1";
  return <>
    <Topbar title="Request a bot" />
    <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader><CardTitle>Tell Vox about your business</CardTitle><p className="text-sm text-muted-foreground">We review your information, generate the Python-powered bot, test it, and only publish it after quality checks.</p></CardHeader>
        <CardContent>{submitted && <div className="mb-5 flex gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700"><CheckCircle2 className="size-5" />Request received. It is now in the Vox review queue.</div>}<BotRequestForm /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Your requests</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!requests.length && <p className="text-sm text-muted-foreground">No requests yet.</p>}
          {requests.map((request) => <div key={request.id} className="rounded-md border p-3"><div className="flex items-start justify-between gap-2"><p className="font-medium">{request.businessName}</p><Badge variant={request.status === "live" ? "success" : "muted"}>{request.status.replaceAll("_", " ")}</Badge></div><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3" />Updated {new Date(request.updatedAt).toLocaleDateString()}</p>{request.adminNotes && <p className="mt-2 text-sm text-muted-foreground">{request.adminNotes}</p>}</div>)}
        </CardContent>
      </Card>
    </div>
  </>;
}

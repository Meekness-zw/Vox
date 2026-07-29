import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, ArrowRight } from "lucide-react";
import { Topbar } from "@/components/dashboard/topbar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { isVoxAdmin } from "@/lib/admin";
import { requireSession } from "@/lib/auth/session-cookies";
import { listAdminBotRequests } from "@/lib/repository";

export const dynamic = "force-dynamic";
export default async function AdminRequestsPage() {
  const session = await requireSession();
  if (!isVoxAdmin(session.email)) redirect("/dashboard");
  const requests = await listAdminBotRequests();
  return <><Topbar title="Bot build queue" /><div className="space-y-5 p-4 sm:p-6"><div><h2 className="font-semibold">Managed bot requests</h2><p className="text-sm text-muted-foreground">Review client information, ask Python to build the bot, test it, then publish.</p></div><div className="space-y-3">{!requests.length && <Card className="p-8 text-center text-sm text-muted-foreground">No client requests are waiting.</Card>}{requests.map((request) => <Link href={`/dashboard/admin/requests/${request.id}`} key={request.id}><Card className="mb-3 flex items-center gap-4 p-4 hover:shadow-md"><div className="flex size-10 items-center justify-center rounded-lg bg-accent"><Bot className="size-5" /></div><div className="min-w-0 flex-1"><p className="font-medium">{request.businessName}</p><p className="truncate text-sm text-muted-foreground">{request.industry} · {request.contactEmail}</p></div><Badge variant={request.status === "live" ? "success" : request.status === "changes_requested" ? "warning" : "muted"}>{request.status.replaceAll("_", " ")}</Badge><ArrowRight className="size-4 text-muted-foreground" /></Card></Link>)}</div></div></>;
}

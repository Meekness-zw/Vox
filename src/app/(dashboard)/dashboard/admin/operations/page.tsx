import { redirect } from "next/navigation";
import { Topbar } from "@/components/dashboard/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { requireSession } from "@/lib/auth/session-cookies";
import { isVoxAdmin } from "@/lib/admin";
import { getOperationsSnapshot } from "@/lib/repository";

export const dynamic = "force-dynamic";

async function endpoint(url: string) {
  const started = Date.now();
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    return { ok: response.ok, latency: Date.now() - started, status: response.status };
  } catch { return { ok: false, latency: Date.now() - started, status: 0 }; }
}

export default async function OperationsPage() {
  const session = await requireSession();
  if (!isVoxAdmin(session.email)) redirect("/dashboard");
  const botBase = process.env.VOX_BOT_SERVICE_URL ?? "http://127.0.0.1:8000";
  const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const [snapshot, railway, vercel] = await Promise.all([
    getOperationsSnapshot(),
    endpoint(new URL("/health", botBase).toString()),
    endpoint(new URL("/", appBase).toString()),
  ]);
  const services = [
    { name: "Vercel application", ...vercel },
    { name: "Railway Python engine", ...railway },
    {
      name: "Supabase database",
      ok: true,
      latency: snapshot.databaseLatency,
        status: snapshot.databaseLatency >= 0 ? 200 : 0,
    },
  ];
  return <><Topbar title="Operations" /><div className="space-y-6 p-4 sm:p-6">
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <StatCard label="Active users" value={String(snapshot.users)} />
      <StatCard label="Active bots" value={String(snapshot.agents)} />
      <StatCard label="Live call sessions" value={String(snapshot.activeCalls)} />
      <StatCard label="Failed CRM deliveries" value={String(snapshot.failedCrm)} />
      <StatCard label="Failed SMS" value={String(snapshot.failedSms)} />
    </div>
    <Card><CardHeader><CardTitle>Live service checks</CardTitle></CardHeader><CardContent className="divide-y p-0">
      {services.map((s) => <div key={s.name} className="flex items-center justify-between px-5 py-4 text-sm">
        <span className="font-medium">{s.name}</span><span className={s.ok ? "text-success" : "text-danger"}>{s.ok ? `Operational${s.latency ? ` · ${s.latency} ms` : ""}` : `Unavailable · HTTP ${s.status}`}</span>
      </div>)}
    </CardContent></Card>
  </div></>;
}

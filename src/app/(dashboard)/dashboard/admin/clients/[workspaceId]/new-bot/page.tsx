import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, WandSparkles } from "lucide-react";
import { createManagedBotRequest } from "../../actions";
import { Topbar } from "@/components/dashboard/topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { isVoxAdmin } from "@/lib/admin";
import { requireSession } from "@/lib/auth/session-cookies";
import { getCompanyProfile, getWorkspaceName } from "@/lib/repository";

export default async function AdminCompanyIntakePage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const session = await requireSession();
  if (!isVoxAdmin(session.email)) redirect("/dashboard");
  const { workspaceId } = await params;
  const [profile, workspaceName] = await Promise.all([getCompanyProfile(workspaceId), getWorkspaceName(workspaceId)]);
  const email = (await searchParams).email ?? "";
  return <><Topbar title={`Build for ${workspaceName}`} /><div className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6"><Link href="/dashboard/admin/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="size-4" />Users & subscriptions</Link><Card><CardHeader><CardTitle>Company intelligence brief</CardTitle><p className="text-sm text-muted-foreground">Feed Vox the company’s approved information. Python will turn it into a tailored bot, private knowledge base, and bot management dashboard.</p></CardHeader><CardContent><form action={createManagedBotRequest} className="space-y-5"><input type="hidden" name="workspaceId" value={workspaceId} /><input type="hidden" name="clientEmail" value={email} /><div className="grid gap-4 sm:grid-cols-2"><Field name="businessName" label="Business name" value={profile?.businessName ?? workspaceName} /><Field name="industry" label="Industry" value={profile?.industry} /><Field name="businessHours" label="Business hours" value={profile?.businessHours} /><Field name="languages" label="Languages" value={profile?.languages ?? "English + Shona"} /><Field name="tone" label="Bot personality" value={profile?.tone ?? "Friendly, professional, and concise"} /><Field name="escalation" label="Human escalation rule" value={profile?.escalation} /></div><Area name="description" label="About the company" value={profile?.description} /><Area name="services" label="Services, prices and important conditions" value={profile?.services} /><fieldset><legend className="text-sm font-medium">Channels</legend><div className="mt-2 flex flex-wrap gap-4 text-sm">{["WhatsApp","Website chat","Phone calls","SMS"].map((channel) => <label key={channel} className="flex items-center gap-2"><input type="checkbox" name="channels" value={channel} defaultChecked={channel !== "SMS"} />{channel}</label>)}</div></fieldset><Button><WandSparkles className="size-4" />Save profile and create build request</Button></form></CardContent></Card></div></>;
}

function Field({ name, label, value }: { name: string; label: string; value?: string }) {
  return <div className="space-y-1.5"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} defaultValue={value} required /></div>;
}
function Area({ name, label, value }: { name: string; label: string; value?: string }) {
  return <div className="space-y-1.5"><Label htmlFor={name}>{label}</Label><Textarea id={name} name={name} defaultValue={value} rows={4} required /></div>;
}

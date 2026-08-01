import { Check, Code2, ScrollText } from "lucide-react";
import { Topbar } from "@/components/dashboard/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session-cookies";
import { getCalendarConnection, getCrmConnection, getOrCreateWidgetConfig, getWorkspaceSendingNumber, listAgents, listAuditEvents, listTeamInvitations, listWorkspaceUsers } from "@/lib/repository";
import { hasCalendarCredentials } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { connectCrm, createInvitation, manageTeamMember, revokeInvitation, saveWidgetSettings } from "./actions";

export const dynamic = "force-dynamic";

const staticIntegrations = [
  { name: "Microsoft Outlook", category: "Calendar", connected: false },
  { name: "HubSpot", category: "CRM", connected: false },
  { name: "Salesforce", category: "CRM", connected: false },
  { name: "Zoho", category: "CRM", connected: false },
  { name: "Pipedrive", category: "CRM", connected: false },
  { name: "Telnyx", category: "Telephony", connected: false },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const session = await getSession();
  const workspaceId = session?.workspaceId ?? "ws_demo";
  const team = await listWorkspaceUsers(workspaceId);
  const invitations = await listTeamInvitations(workspaceId);
  const agents = await listAgents(workspaceId);
  const widgetAgent = agents.find((a) => a.type === "chat" && a.status === "active") ?? agents[0];
  const widget = widgetAgent ? await getOrCreateWidgetConfig(workspaceId, widgetAgent.id) : null;
  const crm = await getCrmConnection(workspaceId);
  const audit = await listAuditEvents(workspaceId);
  const { invite } = await searchParams;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = invite ? `${appUrl}/invite/${invite}` : "";
  const widgetCode = widget ? `<script async src="${appUrl}/api/widget/${widget.public_token}/script"></script>` : "";
  const calendarConnected = hasCalendarCredentials()
    ? Boolean(await getCalendarConnection(workspaceId))
    : false;
  const twilioConfigured = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  const [voiceNumber, whatsappNumber] = await Promise.all([
    getWorkspaceSendingNumber(workspaceId, "voice"),
    getWorkspaceSendingNumber(workspaceId, "whatsapp"),
  ]);
  const voiceConfigured = twilioConfigured && Boolean(voiceNumber);
  const whatsappConfigured = twilioConfigured && Boolean(whatsappNumber);

  return (
    <>
      <Topbar title="Settings" />
      <div className="space-y-6 p-4 sm:p-6">
        {/* Team */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Team management</CardTitle>
              <p className="text-sm text-muted-foreground">
                Roles & permissions for your workspace
              </p>
            </div>
            <form action={createInvitation} className="flex flex-wrap gap-2">
              <Input name="email" type="email" placeholder="teammate@company.com" className="h-8 w-52" required />
              <select name="role" className="h-8 rounded-md border bg-background px-2 text-sm"><option>Agent</option><option>Admin</option></select>
              <Button size="sm">Create invite link</Button>
            </form>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {team.map((m) => (
              <div key={m.email} className="flex items-center gap-3 px-5 py-3.5">
                <div className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-medium text-accent-foreground">
                  {m.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.email}</div>
                </div>
                {m.role === "Owner" ? <Badge variant="default">Owner</Badge> : <form action={manageTeamMember} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={m.id} />
                  <select name="role" defaultValue={m.role} className="h-8 rounded-md border bg-background px-2 text-xs"><option>Agent</option><option>Admin</option></select>
                  <Button size="sm" variant="outline" name="intent" value="role">Save</Button>
                  <Button size="sm" variant="outline" name="intent" value="deactivate">Deactivate</Button>
                </form>}
              </div>
            ))}
            {invitations.filter((i) => !i.accepted_at && !i.revoked_at).map((i) => <div key={String(i.id)} className="flex items-center justify-between px-5 py-3 text-sm">
              <span>{String(i.email)} · pending {String(i.role)}</span><form action={revokeInvitation} className="flex items-center gap-2"><input type="hidden" name="id" value={String(i.id)} /><Badge variant="muted">Expires {new Date(i.expires_at as Date).toLocaleDateString()}</Badge><Button size="sm" variant="outline">Revoke</Button></form>
            </div>)}
          </CardContent>
        </Card>
        {inviteUrl && <Card><CardHeader><CardTitle>Invitation link created</CardTitle></CardHeader><CardContent>
          <p className="mb-2 text-sm text-muted-foreground">Copy and send this link directly to your teammate. It expires in seven days.</p>
          <Input readOnly value={inviteUrl} />
        </CardContent></Card>}

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Code2 className="size-4 text-primary" />Website chat widget</CardTitle>
          <p className="text-sm text-muted-foreground">Paste this before the closing body tag on the client website.</p></CardHeader>
          <CardContent>{widget ? <div className="space-y-4"><textarea readOnly value={widgetCode} className="h-24 w-full rounded-lg border bg-muted p-3 font-mono text-xs" />
            <form action={saveWidgetSettings} className="grid gap-3 sm:grid-cols-2">
              <Input name="title" defaultValue={String(widget.title)} placeholder="Widget title" required />
              <Input name="welcomeMessage" defaultValue={String(widget.welcome_message)} placeholder="Welcome message" required />
              <textarea name="allowedDomains" defaultValue={Array.isArray(widget.allowed_domains) ? widget.allowed_domains.join("\n") : ""} placeholder={"Allowed domains, one per line\nexample.com\nLeave empty to allow all"} className="min-h-24 rounded-lg border bg-background p-3 text-sm sm:col-span-2" />
              <Button className="sm:w-fit">Save widget settings</Button>
            </form>
          </div> : <p className="text-sm text-muted-foreground">Create an active agent before enabling the widget.</p>}</CardContent>
        </Card>

        <Card><CardHeader><CardTitle>CRM webhook</CardTitle>
          <p className="text-sm text-muted-foreground">Send captured website leads to any HTTPS management system. The optional secret is sent as a Bearer token.</p></CardHeader>
          <CardContent><form action={connectCrm} className="grid gap-3 sm:grid-cols-3">
            <Input name="name" placeholder="CRM name" defaultValue={crm ? String(crm.name) : "Company CRM"} required />
            <Input name="webhookUrl" type="url" placeholder="https://crm.example.com/webhooks/vox" defaultValue={crm ? String(crm.webhook_url) : ""} required />
            <Input name="secret" type="password" placeholder={crm ? "Leave blank to replace with none" : "Optional API secret"} />
            <Button className="sm:col-span-3 sm:w-fit">{crm ? "Update CRM connection" : "Connect CRM"}</Button>
          </form></CardContent>
        </Card>

        {/* Integrations */}
        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <p className="text-sm text-muted-foreground">
              Connect CRMs, calendars and telephony providers
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {/* Google Calendar — real OAuth connection */}
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <div className="text-sm font-medium">Google Calendar</div>
                  <div className="text-xs text-muted-foreground">Calendar</div>
                </div>
                {calendarConnected ? (
                  <Badge variant="success">
                    <Check className="size-3" /> {voiceNumber}
                  </Badge>
                ) : (
                  <a
                    href="/api/integrations/google/connect"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Connect
                  </a>
                )}
              </div>

              {/* Twilio voice + WhatsApp — env-var driven, same as System status */}
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <div className="text-sm font-medium">Twilio</div>
                  <div className="text-xs text-muted-foreground">Telephony</div>
                </div>
                {voiceConfigured ? (
                  <Badge variant="success">
                    <Check className="size-3" /> {whatsappNumber}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Set TWILIO_ACCOUNT_SID</span>
                )}
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <div className="text-sm font-medium">WhatsApp Business</div>
                  <div className="text-xs text-muted-foreground">Messaging</div>
                </div>
                {whatsappConfigured ? (
                  <Badge variant="success">
                    <Check className="size-3" /> Connected
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Set TWILIO_WHATSAPP_NUMBER</span>
                )}
              </div>

              {staticIntegrations.map((i) => (
                <div
                  key={i.name}
                  className="flex items-center justify-between rounded-lg border border-border p-4"
                >
                  <div>
                    <div className="text-sm font-medium">{i.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {i.category}
                    </div>
                  </div>
                  <Badge variant={i.connected ? "success" : "muted"}>
                    {i.connected && <Check className="size-3" />}
                    {i.connected ? "Connected" : "Not connected"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Audit log */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="size-4 text-primary" /> Audit log
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {audit.length ? audit.map((e) => <div key={String(e.id)} className="flex justify-between px-5 py-3 text-sm"><span>{String(e.action)} · {String(e.actor_email)}</span><span className="text-muted-foreground">{new Date(e.created_at as Date).toLocaleString()}</span></div>) : <div className="px-5 py-6 text-sm text-muted-foreground">No recorded workspace events yet.</div>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

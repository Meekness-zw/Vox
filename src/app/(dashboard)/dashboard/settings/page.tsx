import { Check, ScrollText } from "lucide-react";
import { Topbar } from "@/components/dashboard/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session-cookies";
import { getCalendarConnection, listWorkspaceUsers } from "@/lib/repository";
import { hasCalendarCredentials } from "@/lib/calendar";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const staticIntegrations = [
  { name: "Microsoft Outlook", category: "Calendar", connected: false },
  { name: "HubSpot", category: "CRM", connected: false },
  { name: "Salesforce", category: "CRM", connected: false },
  { name: "Zoho", category: "CRM", connected: false },
  { name: "Pipedrive", category: "CRM", connected: false },
  { name: "Telnyx", category: "Telephony", connected: false },
];

const roleVariant = { Owner: "default", Admin: "success", Agent: "muted" } as const;

export default async function SettingsPage() {
  const session = await getSession();
  const workspaceId = session?.workspaceId ?? "ws_demo";
  const team = await listWorkspaceUsers(workspaceId);
  const calendarConnected = hasCalendarCredentials()
    ? Boolean(await getCalendarConnection(workspaceId))
    : false;
  const voiceConfigured = Boolean(process.env.TWILIO_ACCOUNT_SID);
  const whatsappConfigured = Boolean(process.env.TWILIO_WHATSAPP_NUMBER);

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
            <Button size="sm" disabled title="Team invitations are not enabled yet">
              Invite member
            </Button>
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
                <Badge variant={roleVariant[m.role as keyof typeof roleVariant]}>
                  {m.role}
                </Badge>
              </div>
            ))}
          </CardContent>
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
                    <Check className="size-3" /> Connected
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
                    <Check className="size-3" /> Connected
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
            <div className="px-5 py-6 text-sm text-muted-foreground">
              No recorded workspace events yet. Audit persistence will be enabled
              before team invitations are released.
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

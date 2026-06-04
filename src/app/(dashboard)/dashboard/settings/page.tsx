import { Check, Plus, ScrollText } from "lucide-react";
import { Topbar } from "@/components/dashboard/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const team = [
  { name: "Bright Smile (You)", email: "owner@brightsmile.com", role: "Owner" },
  { name: "Jordan Lee", email: "jordan@brightsmile.com", role: "Admin" },
  { name: "Priya Patel", email: "priya@brightsmile.com", role: "Agent" },
];

const integrations = [
  { name: "Google Calendar", category: "Calendar", connected: true },
  { name: "Microsoft Outlook", category: "Calendar", connected: false },
  { name: "HubSpot", category: "CRM", connected: true },
  { name: "Salesforce", category: "CRM", connected: false },
  { name: "Zoho", category: "CRM", connected: false },
  { name: "Pipedrive", category: "CRM", connected: false },
  { name: "Twilio", category: "Telephony", connected: true },
  { name: "Telnyx", category: "Telephony", connected: false },
  { name: "WhatsApp Business", category: "Messaging", connected: false },
];

const auditLog = [
  { who: "Jordan Lee", action: "Updated 'Front Desk Receptionist' system prompt", when: "2h ago" },
  { who: "System", action: "Auto-synced knowledge source brightsmile.com", when: "5h ago" },
  { who: "Priya Patel", action: "Paused 'After-Hours Voice Agent'", when: "Yesterday" },
  { who: "Owner", action: "Connected HubSpot integration", when: "3 days ago" },
];

const roleVariant = { Owner: "default", Admin: "success", Agent: "muted" } as const;

export default function SettingsPage() {
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
            <Button size="sm">
              <Plus className="size-4" /> Invite member
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
              {integrations.map((i) => (
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
                  {i.connected ? (
                    <Badge variant="success">
                      <Check className="size-3" /> Connected
                    </Badge>
                  ) : (
                    <Button variant="outline" size="sm">
                      Connect
                    </Button>
                  )}
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
            {auditLog.map((a, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  <span className="font-medium">{a.who}</span>{" "}
                  <span className="text-muted-foreground">{a.action}</span>
                </span>
                <span className="text-xs text-muted-foreground">{a.when}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

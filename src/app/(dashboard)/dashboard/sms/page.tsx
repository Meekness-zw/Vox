import { Plus } from "lucide-react";
import { Topbar } from "@/components/dashboard/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";
import { smsCampaigns } from "@/lib/data";
import { formatNumber } from "@/lib/utils";

export default function SmsPage() {
  const totals = smsCampaigns.reduce(
    (acc, c) => ({
      sent: acc.sent + c.sent,
      delivered: acc.delivered + c.delivered,
      replied: acc.replied + c.replied,
    }),
    { sent: 0, delivered: 0, replied: 0 }
  );
  const deliveryRate = ((totals.delivered / totals.sent) * 100).toFixed(1);
  const replyRate = ((totals.replied / totals.delivered) * 100).toFixed(1);

  return (
    <>
      <Topbar title="SMS Automation" />
      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Messages sent" value={formatNumber(totals.sent)} />
          <StatCard label="Delivered" value={formatNumber(totals.delivered)} />
          <StatCard label="Delivery rate" value={`${deliveryRate}%`} />
          <StatCard label="Reply rate" value={`${replyRate}%`} />
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Automations</CardTitle>
              <p className="text-sm text-muted-foreground">
                Triggered automatically by your agents and calendar events
              </p>
            </div>
            <Button size="sm">
              <Plus className="size-4" /> New automation
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Automation</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 text-right font-medium">Sent</th>
                    <th className="px-5 py-3 text-right font-medium">Delivered</th>
                    <th className="px-5 py-3 text-right font-medium">Replied</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {smsCampaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/50">
                      <td className="px-5 py-3.5 font-medium">{c.name}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {c.type}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={c.status === "active" ? "success" : "muted"}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        {formatNumber(c.sent)}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        {formatNumber(c.delivered)}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        {formatNumber(c.replied)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

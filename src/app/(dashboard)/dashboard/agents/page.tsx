import Link from "next/link";
import { Phone, MessageSquare, Plus, Globe } from "lucide-react";
import { Topbar } from "@/components/dashboard/topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listAgents } from "@/lib/repository";
import { getSession } from "@/lib/auth/session-cookies";

const statusVariant = {
  active: "success",
  draft: "muted",
  paused: "warning",
} as const;

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const session = await getSession();
  const agents = await listAgents(session?.workspaceId);

  return (
    <>
      <Topbar title="Agents" />
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {agents.length} agents · {agents.filter((a) => a.status === "active").length} active
          </p>
          <Link href="/dashboard/agents/new">
            <Button size="sm">
              <Plus className="size-4" /> New agent
            </Button>
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => {
            const Icon = agent.type === "voice" ? Phone : MessageSquare;
            return (
              <Link key={agent.id} href={`/dashboard/agents/${agent.id}`}>
                <Card className="h-full p-5 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div className="flex size-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Icon className="size-5" />
                    </div>
                    <Badge variant={statusVariant[agent.status]}>
                      {agent.status}
                    </Badge>
                  </div>
                  <h3 className="mt-4 font-semibold">{agent.name}</h3>
                  <p className="mt-1 text-sm capitalize text-muted-foreground">
                    {agent.type} agent
                  </p>
                  <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Globe className="size-3.5" /> {agent.language}
                    </div>
                    {agent.voice && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="size-3.5" /> {agent.voice}
                      </div>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}

          <Link href="/dashboard/agents/new">
            <Card className="flex h-full min-h-[200px] flex-col items-center justify-center border-dashed p-5 text-center transition-colors hover:border-primary hover:bg-accent/30">
              <div className="flex size-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Plus className="size-5" />
              </div>
              <h3 className="mt-3 font-semibold">Create a new agent</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Voice or chat — live in minutes
              </p>
            </Card>
          </Link>
        </div>
      </div>
    </>
  );
}

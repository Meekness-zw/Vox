import {
  FileText,
  Globe,
  HelpCircle,
  Table,
  MessageCircleQuestion,
  RefreshCw,
  GitBranch,
  Quote,
  Gauge,
} from "lucide-react";
import { Topbar } from "@/components/dashboard/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddKnowledge } from "@/components/dashboard/add-knowledge";
import { listKnowledgeSources } from "@/lib/repository";
import { getSession } from "@/lib/auth/session-cookies";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const typeIcon = {
  PDF: FileText,
  Document: FileText,
  FAQ: HelpCircle,
  URL: Globe,
  CSV: Table,
  "Manual Q&A": MessageCircleQuestion,
} as const;

const statusVariant = { synced: "success", syncing: "warning", error: "danger" } as const;

const features = [
  { icon: RefreshCw, title: "Auto-sync", desc: "Re-crawls sources on a schedule" },
  { icon: GitBranch, title: "Version control", desc: "Roll back to any prior version" },
  { icon: Quote, title: "Source citations", desc: "Every answer links its source" },
  { icon: Gauge, title: "Confidence scoring", desc: "Flags low-confidence replies" },
];

export default async function KnowledgePage() {
  const session = await getSession();
  const sources = await listKnowledgeSources(session?.workspaceId);
  const totalChunks = sources.reduce((s, k) => s + k.chunks, 0);

  return (
    <>
      <Topbar title="Knowledge Base" />
      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Add source */}
          <Card>
            <CardHeader>
              <CardTitle>Train your agents</CardTitle>
              <p className="text-sm text-muted-foreground">
                Add a website URL or paste content. Vox chunks, embeds, and
                indexes it so your agents answer from it instantly.
              </p>
            </CardHeader>
            <CardContent>
              <AddKnowledge />
            </CardContent>
          </Card>

          {/* Feature strip */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {features.map((f) => (
              <div
                key={f.title}
                className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"
              >
                <f.icon className="mt-0.5 size-5 text-primary" />
                <div>
                  <div className="text-sm font-medium">{f.title}</div>
                  <div className="text-xs text-muted-foreground">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sources list */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Sources</CardTitle>
              <p className="text-sm text-muted-foreground">
                {sources.length} sources · {totalChunks} indexed chunks
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {sources.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No sources yet. Add a URL or paste content above to train your
                agents.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {sources.map((src) => {
                  const Icon = typeIcon[src.type] ?? FileText;
                  return (
                    <div
                      key={src.id}
                      className="flex items-center gap-4 px-5 py-3.5"
                    >
                      <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {src.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {src.type} · {src.chunks} chunks · updated{" "}
                          {timeAgo(src.updatedAt)}
                        </div>
                      </div>
                      <Badge variant={statusVariant[src.status]}>
                        {src.status === "syncing" && (
                          <RefreshCw className="size-3 animate-spin" />
                        )}
                        {src.status}
                      </Badge>
                      <Button variant="ghost" size="sm">
                        Manage
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

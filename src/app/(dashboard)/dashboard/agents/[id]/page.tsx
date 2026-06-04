import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Topbar } from "@/components/dashboard/topbar";
import { AgentBuilder } from "@/components/dashboard/agent-builder";
import { getAgentById } from "@/lib/repository";
import { getSession } from "@/lib/auth/session-cookies";
import type { Agent } from "@/lib/types";

const blankAgent: Agent = {
  id: "ag_web_chat", // reuse demo knowledge base for live preview
  name: "",
  type: "chat",
  status: "draft",
  language: "English (US)",
  voice: "Ava — warm, professional",
  personality: "Friendly, concise, helpful",
  greeting: "Hi! 👋 How can I help you today?",
  systemPrompt:
    "You are a helpful AI agent for a business. Answer questions using the knowledge base, capture leads, and help book appointments.",
  businessHours: "Mon–Fri 9am–5pm",
  escalation: "Hand off to a human when the customer asks for a person.",
  createdAt: new Date().toISOString(),
};

export default async function AgentBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const isNew = id === "new";
  const session = await getSession();
  const agent = isNew ? blankAgent : await getAgentById(id, session?.workspaceId);

  if (!agent) notFound();

  return (
    <>
      <Topbar title={isNew ? "New agent" : agent.name} />
      <div className="space-y-6 p-4 sm:p-6">
        <Link
          href="/dashboard/agents"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to agents
        </Link>
        <AgentBuilder agent={agent} isNew={isNew} />
      </div>
    </>
  );
}

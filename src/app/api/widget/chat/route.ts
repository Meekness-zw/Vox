import { generateReply, type SimpleMessage } from "@/lib/agent-runtime";
import { buildConversation } from "@/lib/conversation";
import { retrieveContext } from "@/lib/rag";
import { getAgentById, getWidgetByToken, upsertConversation } from "@/lib/repository";
import { syncCrmLead } from "@/lib/crm";

export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json();
  const token = String(body.token ?? "");
  const config = await getWidgetByToken(token);
  if (!config) return Response.json({ error: "Widget not found" }, { status: 404 });
  const workspaceId = String(config.workspace_id);
  const agent = await getAgentById(String(config.agent_id), workspaceId);
  if (!agent) return Response.json({ error: "Agent unavailable" }, { status: 503 });
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .slice(-30)
    .filter((m: unknown): m is SimpleMessage => {
      const candidate = m as Partial<SimpleMessage> | null;
      return Boolean(
        candidate &&
        (candidate.role === "user" || candidate.role === "assistant") &&
        typeof candidate.content === "string"
      );
    })
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  if (!last || last.length > 4000) return Response.json({ error: "Invalid message" }, { status: 400 });
  const conversationId = `widget_${workspaceId}_${String(body.conversationId ?? crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const context = await retrieveContext(workspaceId, last);
  const reply = await generateReply(agent, messages, context?.text, {
    workspaceId, agentId: agent.id, channel: "chat", conversationId,
    contactEmail: typeof body.email === "string" ? body.email : undefined,
  });
  const complete = [...messages, { role: "assistant" as const, content: reply }];
  await upsertConversation(buildConversation({
    id: conversationId, agentId: agent.id, channel: "chat",
    contact: String(body.email || body.visitorId || "Website visitor"),
    startedAt: String(body.startedAt || new Date().toISOString()), durationSec: 0, messages: complete,
  }), workspaceId);
  if (body.email || body.name) {
    await syncCrmLead(workspaceId, {
      source: "website_widget", name: body.name || "", email: body.email || "",
      conversationId, latestMessage: last,
    });
  }
  return Response.json({ reply, conversationId });
}

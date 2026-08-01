import { generateReply, type SimpleMessage } from "@/lib/agent-runtime";
import { buildConversation } from "@/lib/conversation";
import { retrieveContext } from "@/lib/rag";
import { consumeWidgetRateLimit, getAgentById, getWidgetByToken, upsertConversation } from "@/lib/repository";
import { syncCrmLead } from "@/lib/crm";
import { bodyTooLarge } from "@/lib/api-security";
import { verifyWidgetEmbed } from "@/lib/widget-auth";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (bodyTooLarge(req, 96_000)) return Response.json({ error: "Request is too large." }, { status: 413 });
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const token = String(body.token ?? "");
  const config = await getWidgetByToken(token);
  if (!config) return Response.json({ error: "Widget not found" }, { status: 404 });
  const allowedDomains = Array.isArray(config.allowed_domains) ? config.allowed_domains.map(String) : [];
  if (allowedDomains.length && !verifyWidgetEmbed(String(body.embedProof ?? ""), token, allowedDomains)) {
    return Response.json({ error: "Embedding domain is not approved" }, { status: 403 });
  }
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const identity = forwarded || req.headers.get("user-agent") || "anonymous";
  if (!(await consumeWidgetRateLimit(token, identity))) {
    return Response.json({ error: "Too many messages. Please wait a minute." }, { status: 429 });
  }
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
    });
  if (messages.some((message) => message.content.length > 4_000)) {
    return Response.json({ error: "Invalid message" }, { status: 400 });
  }
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  if (!last || last.length > 4000) return Response.json({ error: "Invalid message" }, { status: 400 });
  const suppliedId = String(body.conversationId ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);
  const conversationId = `widget_${workspaceId}_${suppliedId || crypto.randomUUID()}`;
  const context = await retrieveContext(workspaceId, last);
  const reply = await generateReply(agent, messages, context?.text, {
    workspaceId, agentId: agent.id, channel: "chat", conversationId,
    contactEmail: typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ? body.email : undefined,
  });
  const complete = [...messages, { role: "assistant" as const, content: reply }];
  await upsertConversation(buildConversation({
    id: conversationId, agentId: agent.id, channel: "chat",
    contact: String(body.email || body.visitorId || "Website visitor").slice(0, 320),
    startedAt: new Date().toISOString(), durationSec: 0, messages: complete,
  }), workspaceId);
  if (body.email || body.name) {
    await syncCrmLead(workspaceId, {
      source: "website_widget", name: String(body.name || "").slice(0, 200), email: String(body.email || "").slice(0, 320),
      conversationId, latestMessage: last,
    });
  }
  return Response.json({ reply, conversationId });
}

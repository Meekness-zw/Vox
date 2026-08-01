import { getAgent, agents } from "@/lib/data";
import { generateReply, type SimpleMessage } from "@/lib/agent-runtime";
import { retrieveContext } from "@/lib/rag";
import { getSession } from "@/lib/auth/session-cookies";
import { getAgentById, listAgents } from "@/lib/repository";
import { allowRequest, bodyTooLarge } from "@/lib/api-security";

export const maxDuration = 30;

/**
 * Non-streaming reply endpoint for the in-browser voice agent. Takes the spoken
 * transcript (as message history), runs it through the same RAG + agent brain
 * as the chat/phone agents, and returns plain text to speak back.
 */
export async function POST(req: Request) {
  if (bodyTooLarge(req, 64_000)) return Response.json({ error: "Request is too large." }, { status: 413 });
  if (!(await allowRequest(req, "voice-demo", 30))) return Response.json({ error: "Too many requests." }, { status: 429 });
  const {
    messages,
    agentId,
  }: { messages: SimpleMessage[]; agentId?: string } = await req.json();

  const session = await getSession();
  const workspaceId = session?.workspaceId ?? "ws_demo";
  const agent = session
    ? (agentId ? await getAgentById(agentId, workspaceId) : undefined) ??
      (await listAgents(workspaceId)).find((candidate) => candidate.type === "voice" && candidate.status === "active")
    : (agentId && getAgent(agentId)) || agents[0];
  if (!agent) return Response.json({ error: "Agent unavailable" }, { status: 404 });

  const history = (Array.isArray(messages) ? messages : []).slice(-30)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: String(m.content ?? "").trim() }))
    .filter((m) => m.content.length > 0);
  if (!history.length || history.some((message) => message.content.length > 4_000)) {
    return Response.json({ error: "Invalid conversation" }, { status: 400 });
  }

  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const ctx = await retrieveContext(workspaceId, lastUser?.content ?? "");
  const reply = await generateReply(agent, history, ctx?.text, session ? {
    workspaceId,
    agentId: agent.id,
    channel: "voice",
    conversationId: `demo_${session.userId}_${Date.now()}`,
    contactEmail: session.email,
  } : undefined);

  return Response.json({ reply, sources: ctx?.sources ?? [] });
}

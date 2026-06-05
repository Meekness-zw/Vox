import { getAgent, agents } from "@/lib/data";
import { generateReply, type SimpleMessage } from "@/lib/agent-runtime";
import { retrieveContext } from "@/lib/rag";
import { getSession } from "@/lib/auth/session-cookies";

export const maxDuration = 30;

/**
 * Non-streaming reply endpoint for the in-browser voice agent. Takes the spoken
 * transcript (as message history), runs it through the same RAG + agent brain
 * as the chat/phone agents, and returns plain text to speak back.
 */
export async function POST(req: Request) {
  const {
    messages,
    agentId,
  }: { messages: SimpleMessage[]; agentId?: string } = await req.json();

  const agent = (agentId && getAgent(agentId)) || agents[0];
  const session = await getSession();
  const workspaceId = session?.workspaceId ?? "ws_demo";

  const history = (messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: String(m.content ?? "").trim() }))
    .filter((m) => m.content.length > 0);

  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const ctx = await retrieveContext(workspaceId, lastUser?.content ?? "");
  const reply = await generateReply(agent, history, ctx?.text);

  return Response.json({ reply, sources: ctx?.sources ?? [] });
}

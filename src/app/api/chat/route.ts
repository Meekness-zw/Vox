import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { getAgent, agents } from "@/lib/data";
import { generateReply, type SimpleMessage } from "@/lib/agent-runtime";
import { retrieveContext } from "@/lib/rag";
import { getSession } from "@/lib/auth/session-cookies";
import { buildConversation } from "@/lib/conversation";
import { getAgentById, listAgents, upsertConversation } from "@/lib/repository";
import { allowRequest, bodyTooLarge } from "@/lib/api-security";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (bodyTooLarge(req, 96_000)) return Response.json({ error: "Request is too large." }, { status: 413 });
  if (!(await allowRequest(req, "chat", 40))) return Response.json({ error: "Too many requests." }, { status: 429 });
  let body: { messages?: UIMessage[]; agentId?: string; conversationId?: string };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { messages, agentId, conversationId } = body;

  const session = await getSession();

  // Authenticated dashboard chat: resolve the agent from the signed-in
  // workspace so each business's own agent/knowledge answers, not the shared
  // marketing-demo mock. Public /demo (no session) keeps using the mock data.
  let agent = session
    ? (agentId && (await getAgentById(agentId, session.workspaceId))) ||
      (await listAgents(session.workspaceId)).find(
        (a) => a.type === "chat" && a.status === "active"
      )
    : (agentId && getAgent(agentId)) || agents[1];
  if (!agent && !session) agent = agents[1];
  if (!agent) return Response.json({ error: "Agent unavailable" }, { status: 404 });

  const workspaceId = session?.workspaceId ?? "ws_demo";

  // Flatten the UI messages into plain {role, content} for the shared brain.
  const history: SimpleMessage[] = (Array.isArray(messages) ? messages : []).slice(-40)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.parts
        .map((p) => ("text" in p ? (p as { text: string }).text : ""))
        .join("")
        .trim(),
    }))
    .filter((m) => m.content.length > 0);
  if (!history.length || history.some((message) => message.content.length > 4_000)) {
    return Response.json({ error: "Invalid conversation" }, { status: 400 });
  }

  // Retrieve relevant knowledge for this turn (RAG), scoped to the workspace.
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const ctx = await retrieveContext(workspaceId, lastUser?.content ?? "");
  const safeConversationId = conversationId && /^[a-zA-Z0-9_-]{1,100}$/.test(conversationId)
    ? conversationId : undefined;

  // One resilient brain for both chat and voice: real model via the AI Gateway
  // when it's reachable, automatic knowledge-base fallback when it isn't (no
  // key, or a gateway/account error). The user never sees a broken stream.
  // Tool-calling (booking/invoicing) is only enabled for authenticated
  // workspace chats — the public marketing /demo stays read-only so an
  // anonymous visitor can't create real appointments or send real invoices.
  const reply = await generateReply(
    agent,
    history,
    ctx?.text,
    session
      ? {
          workspaceId,
          agentId: agent.id,
          channel: "chat",
          conversationId: safeConversationId ? "cv_" + safeConversationId : undefined,
          contactEmail: session.email,
        }
      : undefined
  );

  // Persist the conversation for authenticated workspaces so real chats show
  // up in the dashboard. The public marketing demo (no session) is not stored.
  if (session && safeConversationId) {
    const record = buildConversation({
      id: "cv_" + safeConversationId,
      agentId: agent.id,
      channel: "chat",
      contact: session.email,
      startedAt: new Date().toISOString(),
      durationSec: 0,
      messages: [...history, { role: "assistant", content: reply }],
    });
    await upsertConversation(record, workspaceId);
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const id = "msg_" + Date.now();
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: reply });
      writer.write({ type: "text-end", id });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

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
import { upsertConversation } from "@/lib/repository";

export const maxDuration = 30;

export async function POST(req: Request) {
  const {
    messages,
    agentId,
    conversationId,
  }: { messages: UIMessage[]; agentId?: string; conversationId?: string } =
    await req.json();

  const agent = (agentId && getAgent(agentId)) || agents[1]; // default: chat concierge
  const session = await getSession();
  const workspaceId = session?.workspaceId ?? "ws_demo";

  // Flatten the UI messages into plain {role, content} for the shared brain.
  const history: SimpleMessage[] = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.parts
        .map((p) => ("text" in p ? (p as { text: string }).text : ""))
        .join("")
        .trim(),
    }))
    .filter((m) => m.content.length > 0);

  // Retrieve relevant knowledge for this turn (RAG), scoped to the workspace.
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const ctx = await retrieveContext(workspaceId, lastUser?.content ?? "");

  // One resilient brain for both chat and voice: real model via the AI Gateway
  // when it's reachable, automatic knowledge-base fallback when it isn't (no
  // key, or a gateway/account error). The user never sees a broken stream.
  const reply = await generateReply(agent, history, ctx?.text);

  // Persist the conversation for authenticated workspaces so real chats show
  // up in the dashboard. The public marketing demo (no session) is not stored.
  if (session && conversationId) {
    const record = buildConversation({
      id: "cv_" + conversationId,
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
      for (const token of reply.split(/(\s+)/)) {
        writer.write({ type: "text-delta", id, delta: token });
        await new Promise((r) => setTimeout(r, 14));
      }
      writer.write({ type: "text-end", id });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

import { generateReply, type SimpleMessage } from "@/lib/agent-runtime";
import { buildConversation } from "@/lib/conversation";
import { retrieveContext } from "@/lib/rag";
import { getAgentById, upsertConversation } from "@/lib/repository";

export const maxDuration = 30;

export async function POST(req: Request) {
  const expected = process.env.VOX_BOT_SERVICE_TOKEN;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const workspaceId = String(body.workspaceId ?? "");
  const agentId = String(body.agentId ?? "");
  const callSid = String(body.callSid ?? "");
  const messages = (Array.isArray(body.messages) ? body.messages : []) as SimpleMessage[];
  const agent = await getAgentById(agentId, workspaceId);
  if (!agent || !callSid) return Response.json({ error: "Agent unavailable" }, { status: 404 });
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const context = await retrieveContext(workspaceId, last);
  const reply = await generateReply(agent, messages, context?.text, {
    workspaceId, agentId, channel: "voice",
    conversationId: `cv_${callSid}`, contactPhone: String(body.caller ?? ""),
  });
  const complete = [...messages, { role: "assistant" as const, content: reply }];
  await upsertConversation(buildConversation({
    id: `cv_${callSid}`, agentId, channel: "voice",
    contact: String(body.caller ?? "unknown"),
    startedAt: String(body.startedAt ?? new Date().toISOString()),
    durationSec: Math.max(0, Math.round((Date.now() - new Date(body.startedAt ?? Date.now()).getTime()) / 1000)),
    messages: complete,
  }), workspaceId);
  return Response.json({ reply });
}

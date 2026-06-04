import { agents, getAgent } from "@/lib/data";
import { generateReply } from "@/lib/agent-runtime";
import { retrieveContext } from "@/lib/rag";
import { buildConversation } from "@/lib/conversation";
import { upsertConversation } from "@/lib/repository";
import {
  sayAndGather,
  sayAndHangup,
  isClosing,
  getSession,
  startSession,
  endSession,
} from "@/lib/voice/twiml";

export const maxDuration = 30;

/**
 * Twilio <Gather> action webhook. Receives the caller's transcribed speech,
 * runs it through the agent (real model via AI Gateway, or the offline
 * responder), speaks the reply, and listens again — a full STT → LLM → TTS
 * voice loop.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const form = await req.formData();
  const callSid = String(form.get("CallSid") ?? `local_${Date.now()}`);
  const from = String(form.get("From") ?? "unknown");
  const speech = String(form.get("SpeechResult") ?? "").trim();

  const agentId =
    url.searchParams.get("agentId") ??
    getSession(callSid)?.agentId ??
    agents.find((a) => a.type === "voice")?.id ??
    agents[0].id;
  const agent = getAgent(agentId) ?? agents[0];

  const session = getSession(callSid) ?? startSession(callSid, agentId, from);

  // No speech detected — re-prompt once.
  if (!speech) {
    return sayAndGather(
      "Sorry, I didn't quite hear that. Could you say that again?",
      `/api/voice/respond?agentId=${encodeURIComponent(agentId)}`
    );
  }

  session.messages.push({ role: "user", content: speech });
  const ctx = await retrieveContext("ws_demo", speech);
  const reply = await generateReply(agent, session.messages, ctx?.text);
  session.messages.push({ role: "assistant", content: reply });

  // End the call when the caller says goodbye or the agent closes out.
  if (isClosing(speech) || isClosing(reply)) {
    const ended = endSession(callSid);
    if (ended) {
      const durationSec = Math.max(
        1,
        Math.round((Date.now() - new Date(ended.startedAt).getTime()) / 1000)
      );
      const record = buildConversation({
        id: "cv_" + callSid,
        agentId: ended.agentId,
        channel: "voice",
        contact: ended.from,
        startedAt: ended.startedAt,
        durationSec,
        messages: ended.messages,
      });
      // Persist the completed call so it appears in the dashboard.
      await upsertConversation(record, "ws_demo");
    }
    return sayAndHangup(reply);
  }

  return sayAndGather(
    reply,
    `/api/voice/respond?agentId=${encodeURIComponent(agentId)}`
  );
}

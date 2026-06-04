import { agents, getAgent } from "@/lib/data";
import { sayAndGather, startSession } from "@/lib/voice/twiml";

export const maxDuration = 30;

/**
 * Twilio inbound-call webhook. Point a Twilio phone number's "A call comes in"
 * Voice webhook at:  POST https://<your-app>/api/voice/incoming
 *
 * Optionally pass ?agentId=ag_xxx to choose which voice agent answers; by
 * default the first active voice agent is used.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const form = await req.formData();
  const callSid = String(form.get("CallSid") ?? `local_${Date.now()}`);
  const from = String(form.get("From") ?? "unknown");

  const agentId =
    url.searchParams.get("agentId") ??
    agents.find((a) => a.type === "voice" && a.status === "active")?.id ??
    agents[0].id;

  const agent = getAgent(agentId) ?? agents[0];
  startSession(callSid, agentId, from);

  const action = `/api/voice/respond?agentId=${encodeURIComponent(agentId)}`;
  return sayAndGather(agent.greeting, action);
}

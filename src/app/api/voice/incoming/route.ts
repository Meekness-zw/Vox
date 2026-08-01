import { createHmac } from "node:crypto";
import { getAgentById, getRoutingForNumber } from "@/lib/repository";
import { connectMediaStream, sayAndGather, startSession } from "@/lib/voice/twiml";
import { formDataToParams, isValidTwilioRequest, publicWebhookUrl } from "@/lib/twilio-signature";
import { isDbEnabled } from "@/lib/db";
import { resolveElevenLabsVoiceId } from "@/lib/voice/elevenlabs-voices";

export const maxDuration = 30;

/**
 * Twilio inbound-call webhook. Point a Twilio phone number's "A call comes in"
 * Voice webhook at:  POST https://<your-app>/api/voice/incoming
 *
 * The number dialed (`To`) is looked up in `phone_numbers` to find which
 * workspace + agent should answer — so each business's own number reaches
 * its own agent, knowledge base, calendar, and invoices. Optionally pass
 * ?agentId=ag_xxx to override which agent answers within that workspace.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const form = await req.formData();

  if (
    !isValidTwilioRequest({
      signatureHeader: req.headers.get("x-twilio-signature"),
      url: publicWebhookUrl(req),
      params: formDataToParams(form),
    })
  ) {
    return new Response("Invalid signature", { status: 403 });
  }

  const callSid = String(form.get("CallSid") ?? `local_${Date.now()}`);
  const from = String(form.get("From") ?? "unknown");
  const to = String(form.get("To") ?? "unknown");

  const route = await getRoutingForNumber(to, "voice");
  const workspaceId = route?.workspaceId ?? (isDbEnabled ? "" : "ws_demo");
  const agentId = url.searchParams.get("agentId") ?? route?.agentId;

  const agent = workspaceId && agentId ? await getAgentById(agentId, workspaceId) : undefined;
  if (!agent) {
    return sayAndGather(
      "Sorry, this number isn't set up yet. Please try again later.",
      "/api/voice/incoming"
    );
  }

  await startSession(callSid, agent.id, from, workspaceId);

  const botServiceUrl = process.env.VOX_BOT_SERVICE_URL?.trim();
  const derivedStreamUrl = botServiceUrl
    ? new URL("/v1/twilio-media", botServiceUrl.replace(/^http/, "ws")).toString()
    : "";
  const streamUrl = process.env.VOX_MEDIA_STREAM_URL?.trim() || derivedStreamUrl;
  const serviceToken = process.env.VOX_BOT_SERVICE_TOKEN;
  if (serviceToken && streamUrl) {
    const expires = String(Math.floor(Date.now() / 1000) + 300);
    const payload = `${callSid}.${workspaceId}.${agent.id}.${expires}`;
    const token = createHmac("sha256", serviceToken).update(payload).digest("hex");
    return connectMediaStream(streamUrl, {
      callSid, workspaceId, agentId: agent.id, caller: from,
      greeting: agent.greeting.slice(0, 400), language: agent.language.slice(0, 100),
      voiceId: resolveElevenLabsVoiceId(agent.voice),
      expires, token,
    });
  }

  const action = `/api/voice/respond?agentId=${encodeURIComponent(agent.id)}`;
  return sayAndGather(agent.greeting, action, agent.language);
}

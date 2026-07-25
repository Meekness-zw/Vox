import { getAgentById, getRoutingForNumber } from "@/lib/repository";
import { sayAndGather, startSession } from "@/lib/voice/twiml";
import { formDataToParams, isValidTwilioRequest, publicWebhookUrl } from "@/lib/twilio-signature";

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
  const workspaceId = route?.workspaceId ?? "ws_demo";
  const agentId = url.searchParams.get("agentId") ?? route?.agentId;

  const agent = agentId ? await getAgentById(agentId, workspaceId) : undefined;
  if (!agent) {
    return sayAndGather(
      "Sorry, this number isn't set up yet. Please try again later.",
      "/api/voice/incoming"
    );
  }

  startSession(callSid, agent.id, from, workspaceId);

  const action = `/api/voice/respond?agentId=${encodeURIComponent(agent.id)}`;
  return sayAndGather(agent.greeting, action, agent.language);
}

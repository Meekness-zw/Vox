import { addAuditEvent } from "@/lib/repository";
import { formDataToParams, isValidTwilioRequest, publicWebhookUrl } from "@/lib/twilio-signature";
import { sayAndHangup } from "@/lib/voice/twiml";

export async function POST(req: Request) {
  const form = await req.formData();
  if (!isValidTwilioRequest({
    signatureHeader: req.headers.get("x-twilio-signature"),
    url: publicWebhookUrl(req),
    params: formDataToParams(form),
  })) return new Response("Invalid signature", { status: 403 });
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") ?? "";
  const callSid = url.searchParams.get("callSid") ?? String(form.get("CallSid") ?? "");
  const status = String(form.get("DialCallStatus") ?? "unknown");
  await addAuditEvent(workspaceId, "voice-bot", status === "completed" ? "call.transfer_completed" : "call.transfer_followup_required", { callSid, status });
  return sayAndHangup(status === "completed"
    ? "Thank you for calling. Goodbye."
    : "The team member is unavailable. I have saved a follow-up request and someone will contact you.");
}

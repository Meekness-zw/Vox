import {
  claimWebhookEvent,
  completeWebhookEvent,
  releaseWebhookEvent,
  updateConversationMessageDelivery,
} from "@/lib/repository";
import { bodyTooLarge } from "@/lib/api-security";
import {
  formDataToParams,
  isValidTwilioRequest,
  publicWebhookUrl,
} from "@/lib/twilio-signature";

const DELIVERY_STATUSES = new Set([
  "accepted",
  "scheduled",
  "queued",
  "sending",
  "sent",
  "delivered",
  "read",
  "undelivered",
  "failed",
  "canceled",
]);

function normalizeDeliveryStatus(status: string) {
  if (["accepted", "scheduled", "queued", "sending"].includes(status)) return "queued" as const;
  if (status === "sent") return "sent" as const;
  if (status === "delivered") return "delivered" as const;
  if (status === "read") return "read" as const;
  return "failed" as const;
}

/** Twilio delivery callback for outbound Team Inbox SMS/WhatsApp messages. */
export async function POST(req: Request) {
  if (bodyTooLarge(req, 128_000)) return new Response("Request is too large", { status: 413 });
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

  const messageId = new URL(req.url).searchParams.get("messageId")?.trim() ?? "";
  const providerMessageSid = String(form.get("MessageSid") ?? "").trim();
  const rawStatus = String(form.get("MessageStatus") ?? "").trim().toLowerCase();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(messageId) ||
      !/^[A-Z]{2}[0-9a-fA-F]{32}$/.test(providerMessageSid) ||
      !DELIVERY_STATUSES.has(rawStatus)) {
    return new Response("Invalid callback", { status: 400 });
  }
  const eventId = `twilio:message-status:${providerMessageSid}:${rawStatus}`;
  const claim = await claimWebhookEvent(eventId, "twilio_message_status");
  if (!claim.claimed) return new Response(null, { status: 204 });
  try {
    const errorCode = String(form.get("ErrorCode") ?? "").trim().slice(0, 20);
    const errorMessage = String(form.get("ErrorMessage") ?? "").trim().slice(0, 500);
    await updateConversationMessageDelivery({
      messageId,
      providerMessageSid,
      status: normalizeDeliveryStatus(rawStatus),
      error: [errorCode, errorMessage].filter(Boolean).join(": ") || undefined,
    });
    await completeWebhookEvent(eventId);
    // Unknown/deleted local messages deliberately return success so Twilio does
    // not retry a signed but no-longer-actionable delivery event indefinitely.
    return new Response(null, { status: 204 });
  } catch (error) {
    await releaseWebhookEvent(eventId);
    throw error;
  }
}

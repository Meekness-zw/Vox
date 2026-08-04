import {
  addAuditEvent,
  appendConversationMessage,
  claimWebhookEvent,
  completeWebhookEvent,
  ensureInboxConversation,
  getConversationById,
  releaseWebhookEvent,
  requestHumanHandoff,
  updateInboxConversationState,
} from "@/lib/repository";
import { formDataToParams, isValidTwilioRequest, publicWebhookUrl } from "@/lib/twilio-signature";
import { endSession, getSession as getVoiceSession, sayAndHangup, twimlResponse } from "@/lib/voice/twiml";

const DIAL_STATUSES = new Set(["completed", "busy", "no-answer", "failed", "canceled"]);

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
  const shona = url.searchParams.get("language") === "shona";
  const dialCallSid = String(form.get("DialCallSid") ?? "");
  const suppliedStatus = String(form.get("DialCallStatus") ?? "unknown").toLowerCase();
  const status = DIAL_STATUSES.has(suppliedStatus) ? suppliedStatus : "failed";
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(workspaceId) ||
      !/^CA[0-9a-fA-F]{32}$/.test(callSid) ||
      (dialCallSid && !/^CA[0-9a-fA-F]{32}$/.test(dialCallSid))) {
    return new Response("Invalid callback", { status: 400 });
  }

  const eventId = `twilio:voice-transfer:${dialCallSid || callSid}:${status}`;
  const claim = await claimWebhookEvent(eventId, "twilio_voice_transfer");
  if (!claim.claimed) return claim.responseText ? sayAndHangup(claim.responseText) : twimlResponse("");

  try {
    const conversationId = `cv_${callSid}`;
    const session = await getVoiceSession(callSid);
    const existing = await getConversationById(conversationId, workspaceId);
    if (session && session.workspaceId !== workspaceId) {
      await releaseWebhookEvent(eventId);
      return new Response("Call workspace mismatch", { status: 403 });
    }
    const agentId = session?.agentId ?? existing?.agentId;
    const caller = session?.from ?? existing?.contact;
    if (agentId && caller) {
      await ensureInboxConversation({
        id: conversationId,
        workspaceId,
        agentId,
        channel: "voice",
        contact: caller,
        startedAt: existing?.startedAt,
      });
      await appendConversationMessage({
        workspaceId,
        conversationId,
        authorType: "system",
        body: status === "completed"
          ? "The caller completed a live transfer with a team member."
          : `The live transfer was not answered (${status}); a callback is required.`,
        channel: "voice",
        direction: "internal",
        idempotencyKey: eventId,
      });
    }

    let spoken: string;
    if (status === "completed") {
      if (agentId && caller) {
        await updateInboxConversationState({
          workspaceId,
          conversationId,
          inboxStatus: "resolved",
          botMode: "paused",
        });
      }
      await addAuditEvent(workspaceId, "voice-bot", "call.transfer_completed", {
        callSid,
        dialCallSid: dialCallSid || undefined,
        conversationId,
      });
      spoken = shona ? "Tinotenda nekufona. Sarai zvakanaka." : "Thank you for calling. Goodbye.";
    } else {
      if (agentId && caller) {
        await requestHumanHandoff({
          workspaceId,
          conversationId,
          reason: `Live voice transfer was ${status}. Call ${caller} back.`,
          priority: "high",
        });
      }
      await addAuditEvent(workspaceId, "voice-bot", "call.transfer_followup_required", {
        callSid,
        dialCallSid: dialCallSid || undefined,
        conversationId,
        status,
      });
      spoken = shona
        ? "Munhu wechikwata haana kubatika. Ndachengeta chikumbiro chekuti vakufonerei."
        : "The team member is unavailable. I've saved a callback request and someone will contact you.";
    }
    await endSession(callSid);
    await completeWebhookEvent(eventId, spoken);
    return sayAndHangup(spoken);
  } catch (error) {
    await releaseWebhookEvent(eventId);
    throw error;
  }
}

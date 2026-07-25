"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session-cookies";
import { addAuditEvent, insertSmsMessage } from "@/lib/repository";

export async function sendSms(formData: FormData) {
  const session = await requireSession();
  const to = String(formData.get("to") ?? "").trim().replace(/[^\d+]/g, "");
  const body = String(formData.get("body") ?? "").trim();
  const from = String(process.env.TWILIO_PHONE_NUMBER ?? "").replace(/[^\d+]/g, "");
  if (!/^\+\d{8,15}$/.test(to) || !body || body.length > 1500) throw new Error("Enter a valid international number and message.");
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !from) throw new Error("Twilio SMS is not configured.");
  let status = "failed", twilioSid: string | undefined, errorMessage: string | undefined;
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    const result = await response.json();
    status = response.ok ? String(result.status ?? "queued") : "failed";
    twilioSid = result.sid;
    errorMessage = response.ok ? undefined : String(result.message ?? "Twilio rejected the message");
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "SMS delivery failed";
  }
  await insertSmsMessage({
    workspaceId: session.workspaceId, to, from, body, createdBy: session.userId,
    status, twilioSid, errorMessage,
  });
  await addAuditEvent(session.workspaceId, session.email, "sms.sent", { to, status });
  revalidatePath("/dashboard/sms");
}

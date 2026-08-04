import { isLikelyShona } from "../handoff-detection";
import { escapeXml, twimlResponse } from "./twiml";

function e164(value: string) {
  const normalized = value.trim().replace(/[^\d+]/g, "");
  if (!/^\+\d{8,15}$/.test(normalized)) {
    throw new Error("A valid human transfer number is required.");
  }
  return normalized;
}

function transferCallbackUrl(workspaceId: string, callSid: string, language: "english" | "shona") {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is required for voice transfer callbacks.");
  const callback = new URL("/api/voice/transfer-status", appUrl);
  callback.searchParams.set("workspaceId", workspaceId);
  callback.searchParams.set("callSid", callSid);
  callback.searchParams.set("language", language);
  return callback.toString();
}

export function transferTwiml(input: {
  workspaceId: string;
  callSid: string;
  transferPhone: string;
  callerId?: string;
  acknowledgement: string;
}) {
  const transferPhone = e164(input.transferPhone);
  const callerId = input.callerId ? e164(input.callerId) : "";
  if (callerId && callerId === transferPhone) {
    throw new Error("The transfer number cannot be the Vox answering number.");
  }
  const callback = transferCallbackUrl(
    input.workspaceId,
    input.callSid,
    isLikelyShona(input.acknowledgement) ? "shona" : "english"
  );
  return `<Say>${escapeXml(input.acknowledgement)}</Say>` +
    `<Dial action="${escapeXml(callback)}" method="POST" timeout="20" answerOnBridge="true"${
      callerId ? ` callerId="${escapeXml(callerId)}"` : ""
    }><Number>${escapeXml(transferPhone)}</Number></Dial>`;
}

export function directTransferResponse(input: Parameters<typeof transferTwiml>[0]) {
  return twimlResponse(transferTwiml(input));
}

/** Replace a live media-stream call with Twilio <Dial> TwiML. */
export async function redirectLiveCallToHuman(input: Parameters<typeof transferTwiml>[0]) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) throw new Error("Twilio voice transfer is not configured.");
  if (!/^CA[0-9a-fA-F]{32}$/.test(input.callSid)) throw new Error("Invalid Twilio call SID.");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${transferTwiml(input)}</Response>`;
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${input.callSid}.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ Twiml: xml }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    }
  );
  if (!response.ok) throw new Error(`Twilio could not start the transfer (${response.status}).`);
}

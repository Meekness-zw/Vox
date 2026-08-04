export type TwilioMessageChannel = "sms" | "whatsapp";

export type TwilioMessageResult = {
  sid: string;
  status: string;
};

function credentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new Error("Twilio messaging is not configured.");
  }
  return { accountSid, authToken };
}

function normalizeE164(value: string) {
  const normalized = value.trim().replace(/[^\d+]/g, "");
  if (!/^\+\d{8,15}$/.test(normalized)) {
    throw new Error("A valid international phone number is required.");
  }
  return normalized;
}

function channelAddress(value: string, channel: TwilioMessageChannel) {
  const number = normalizeE164(value.replace(/^whatsapp:/i, ""));
  return channel === "whatsapp" ? `whatsapp:${number}` : number;
}

/**
 * Send a single customer message with Twilio. Persistence and tenant checks
 * deliberately live in the caller so this helper cannot be used to bypass a
 * workspace-scoped inbox action.
 */
export async function sendTwilioMessage(input: {
  channel: TwilioMessageChannel;
  to: string;
  from: string;
  body: string;
  statusCallback?: string;
}): Promise<TwilioMessageResult> {
  const body = input.body.trim();
  if (!body || body.length > 4_000) {
    throw new Error("Message must be between 1 and 4,000 characters.");
  }

  const { accountSid, authToken } = credentials();
  const params = new URLSearchParams({
    To: channelAddress(input.to, input.channel),
    From: channelAddress(input.from, input.channel),
    Body: body,
  });
  if (input.statusCallback) params.set("StatusCallback", input.statusCallback);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    }
  );
  const result = (await response.json().catch(() => ({}))) as {
    sid?: string;
    status?: string;
    message?: string;
  };
  if (!response.ok || !result.sid) {
    throw new Error(result.message || `Twilio rejected the message (${response.status}).`);
  }
  return { sid: result.sid, status: result.status || "queued" };
}

export function twilioStatusCallbackUrl(messageId: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!appUrl) return undefined;
  return `${appUrl}/api/messaging/status?messageId=${encodeURIComponent(messageId)}`;
}

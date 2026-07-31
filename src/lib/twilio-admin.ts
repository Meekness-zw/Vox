type TwilioVoiceNumber = {
  sid: string;
  phone_number: string;
};

export type WhatsAppSender = {
  sid: string;
  status: string;
  sender_id: string;
};

function credentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) throw new Error("Twilio is not configured.");
  return {
    accountSid,
    authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
  };
}

async function twilioJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const { authorization } = credentials();
  const response = await fetch(url, {
    ...init,
    headers: { authorization, ...init.headers },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(body.message || body.detail || `Twilio returned HTTP ${response.status}`));
  }
  return body as T;
}

export function voiceWebhookUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL is required for Twilio onboarding.");
  return new URL("/api/voice/incoming", base).toString();
}

export function whatsappWebhookUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL is required for WhatsApp onboarding.");
  return new URL("/api/whatsapp/incoming", base).toString();
}

export async function configureOwnedVoiceNumber(phoneNumber: string, friendlyName: string) {
  const { accountSid } = credentials();
  const list = await twilioJson<{ incoming_phone_numbers?: TwilioVoiceNumber[] }>(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`
  );
  const owned = list.incoming_phone_numbers?.[0];
  if (!owned) throw new Error("That number is not owned by this Twilio account.");
  await twilioJson(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${owned.sid}.json`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        FriendlyName: friendlyName,
        VoiceUrl: voiceWebhookUrl(),
        VoiceMethod: "POST",
      }),
    }
  );
  return owned;
}

export async function purchaseVoiceNumber(input: {
  country: string;
  areaCode?: string;
  friendlyName: string;
}) {
  const { accountSid } = credentials();
  const country = input.country.toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new Error("Select a valid country.");
  const query = new URLSearchParams({ VoiceEnabled: "true", Limit: "1" });
  if (input.areaCode?.trim()) query.set("AreaCode", input.areaCode.replace(/\D/g, ""));
  const available = await twilioJson<{ available_phone_numbers?: TwilioVoiceNumber[] }>(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/${country}/Local.json?${query}`
  );
  const candidate = available.available_phone_numbers?.[0];
  if (!candidate?.phone_number) {
    throw new Error("Twilio has no matching voice number available. Try another country or area code.");
  }
  return twilioJson<TwilioVoiceNumber>(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        PhoneNumber: candidate.phone_number,
        FriendlyName: input.friendlyName,
        VoiceUrl: voiceWebhookUrl(),
        VoiceMethod: "POST",
      }),
    }
  );
}

export async function startWhatsAppSender(input: {
  phoneNumber: string;
  wabaId: string;
  displayName: string;
  verificationMethod: "sms" | "voice";
}) {
  return twilioJson<WhatsAppSender>("https://messaging.twilio.com/v2/Channels/Senders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sender_id: `whatsapp:${input.phoneNumber}`,
      configuration: {
        waba_id: input.wabaId,
        verification_method: input.verificationMethod,
      },
      webhook: {
        callback_url: whatsappWebhookUrl(),
        callback_method: "POST",
      },
      profile: { name: input.displayName },
    }),
  });
}

export async function getWhatsAppSender(senderSid: string) {
  if (!/^XE[0-9a-fA-F]{32}$/.test(senderSid)) throw new Error("Invalid WhatsApp sender SID.");
  return twilioJson<WhatsAppSender>(
    `https://messaging.twilio.com/v2/Channels/Senders/${senderSid}`
  );
}

export async function verifyWhatsAppSender(senderSid: string, verificationCode: string) {
  if (!/^\d{6}$/.test(verificationCode)) throw new Error("Enter the 6-digit OTP sent by Meta.");
  return twilioJson<WhatsAppSender>(
    `https://messaging.twilio.com/v2/Channels/Senders/${senderSid}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        configuration: { verification_code: verificationCode },
        webhook: {
          callback_url: whatsappWebhookUrl(),
          callback_method: "POST",
        },
      }),
    }
  );
}

export async function configureWhatsAppWebhook(senderSid: string) {
  return twilioJson<WhatsAppSender>(
    `https://messaging.twilio.com/v2/Channels/Senders/${senderSid}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        webhook: {
          callback_url: whatsappWebhookUrl(),
          callback_method: "POST",
        },
      }),
    }
  );
}

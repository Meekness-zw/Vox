import { createHmac, timingSafeEqual } from "node:crypto";

export function formDataToParams(form: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }
  return params;
}

/**
 * Reconstructs the URL Twilio actually signed. Behind a reverse proxy (Vercel)
 * the raw request URL can report the wrong protocol/host, so prefer
 * NEXT_PUBLIC_APP_URL (the URL configured in the Twilio console) when set.
 */
export function publicWebhookUrl(req: Request): string {
  const reqUrl = new URL(req.url);
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) return reqUrl.toString();
  return new URL(reqUrl.pathname + reqUrl.search, base).toString();
}

/**
 * Validates Twilio's X-Twilio-Signature header (HMAC-SHA1 over the webhook
 * URL + sorted POST params) per
 * https://www.twilio.com/docs/usage/security#validating-requests.
 * Skipped (returns true) when TWILIO_AUTH_TOKEN is unset, matching the rest of
 * the app's zero-config demo convention — set it before going to production.
 */
export function isValidTwilioRequest(opts: {
  signatureHeader: string | null;
  url: string;
  params: Record<string, string>;
}): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return true;
  if (!opts.signatureHeader) return false;

  let data = opts.url;
  for (const key of Object.keys(opts.params).sort()) data += key + opts.params[key];

  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(opts.signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

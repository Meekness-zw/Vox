import { createHmac, timingSafeEqual } from "node:crypto";

function key() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new Error("SESSION_SECRET is required for restricted widgets.");
  return secret;
}

function signature(value: string) {
  return createHmac("sha256", key()).update(value).digest("base64url");
}

export function widgetDomainAllowed(host: string, allowedDomains: string[]) {
  const normalized = host.toLowerCase().replace(/\.$/, "");
  return allowedDomains.some((domain) => {
    const allowed = domain.toLowerCase().replace(/\.$/, "");
    return normalized === allowed || normalized.endsWith(`.${allowed}`);
  });
}

export function signWidgetEmbed(token: string, host: string) {
  const expires = Math.floor(Date.now() / 1000) + 10 * 60;
  const body = Buffer.from(JSON.stringify({ token, host, expires })).toString("base64url");
  return `${body}.${signature(body)}`;
}

export function verifyWidgetEmbed(proof: string, token: string, allowedDomains: string[]) {
  try {
    const [body, supplied] = proof.split(".");
    if (!body || !supplied) return false;
    const expected = signature(body);
    const a = Buffer.from(expected);
    const b = Buffer.from(supplied);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      token?: string; host?: string; expires?: number;
    };
    return payload.token === token && typeof payload.host === "string" &&
      typeof payload.expires === "number" && payload.expires >= Date.now() / 1000 &&
      widgetDomainAllowed(payload.host, allowedDomains);
  } catch {
    return false;
  }
}

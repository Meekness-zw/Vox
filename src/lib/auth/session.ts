export const SESSION_COOKIE = "vox_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type SessionPayload = {
  userId: string;
  workspaceId: string;
  email: string;
  name: string;
  role?: string;
  exp: number;
};

const sessionSecret = () => {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be configured in production.");
  }

  return "dev-only-insecure-secret-change-me";
};

const secret = () => new TextEncoder().encode(sessionSecret());

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    secret(),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(sig);
}

function signaturesMatch(expected: string, provided: string) {
  try {
    const expectedBytes = fromB64url(expected);
    const providedBytes = fromB64url(provided);
    if (expectedBytes.length !== providedBytes.length) return false;

    // Keep comparison work independent of the first differing byte. Web Crypto
    // is used here because this module also runs in the Next.js edge proxy.
    let difference = 0;
    for (let index = 0; index < expectedBytes.length; index += 1) {
      difference |= expectedBytes[index] ^ providedBytes[index];
    }
    return difference === 0;
  } catch {
    return false;
  }
}

/** Create a signed, tamper-evident session token (stateless). */
export async function signSession(
  payload: Omit<SessionPayload, "exp">
): Promise<string> {
  const full: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const body = b64url(new TextEncoder().encode(JSON.stringify(full)));
  const sig = await hmac(body);
  return `${body}.${sig}`;
}

export async function verifySession(
  token: string | undefined
): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (!signaturesMatch(await hmac(body), sig)) return null;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(fromB64url(body))
    ) as SessionPayload;
    if (
      typeof payload.userId !== "string" ||
      typeof payload.workspaceId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp * 1000 < Date.now()
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "vox_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type SessionPayload = {
  userId: string;
  workspaceId: string;
  email: string;
  name: string;
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
  if ((await hmac(body)) !== sig) return null;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(fromB64url(body))
    ) as SessionPayload;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

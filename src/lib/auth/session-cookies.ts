import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  verifySession,
  type SessionPayload,
} from "./session";
import { findActiveUserBySession, isDbEnabled } from "@/lib/repository";

/** Read + verify the current session from cookies (server only). */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session || !isDbEnabled) return session;

  const user = await findActiveUserBySession(session.userId, session.workspaceId);
  if (!user || user.email.toLowerCase() !== session.email.toLowerCase()) return null;
  // Authorization stays bound to the signed identifiers, while display data
  // is refreshed from the canonical user row on every request.
  return { ...session, name: user.name, email: user.email, role: user.role };
}

/** Session or throw — use in pages/actions that require auth. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session;
}

/** Require a workspace role allowed to change bot and integration settings. */
export async function requireWorkspaceManager(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!isDbEnabled) return session;
  const user = await findActiveUserBySession(session.userId, session.workspaceId);
  if (!user || !["Owner", "Admin"].includes(user.role)) {
    throw new Error("Owner or Admin access required");
  }
  return session;
}

/** Allow only roles entrusted with private financial records. */
export async function requireFinancialManager(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!isDbEnabled) return session;
  const user = await findActiveUserBySession(session.userId, session.workspaceId);
  if (!user || !["Owner", "Admin", "Bookkeeper"].includes(user.role)) {
    throw new Error("Owner, Admin, or Bookkeeper access required");
  }
  return session;
}

/** Customer conversations and internal notes are limited to inbox operators. */
export async function requireInboxOperator(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!isDbEnabled) {
    if (!["Owner", "Admin", "Agent"].includes(session.role ?? "")) {
      throw new Error("Owner, Admin, or Agent access required");
    }
    return session;
  }
  const user = await findActiveUserBySession(session.userId, session.workspaceId);
  if (!user || !["Owner", "Admin", "Agent"].includes(user.role)) {
    throw new Error("Owner, Admin, or Agent access required");
  }
  return session;
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

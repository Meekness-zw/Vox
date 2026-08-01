"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import {
  findUserByEmail,
  createWorkspaceWithOwner,
  isDbEnabled,
  consumeWidgetRateLimit,
} from "@/lib/repository";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/session";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth/session-cookies";

export type AuthState = { error?: string };

// Demo credentials used when no database is configured.
const DEMO_EMAIL = "demo@vox.ai";
const DEMO_PASSWORD = "demo1234";

async function allowAuthAttempt(scope: string, email: string, limit: number) {
  if (!isDbEnabled) return true;
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const identity = createHash("sha256").update(`${ip}:${email}`).digest("hex").slice(0, 32);
  return consumeWidgetRateLimit(`auth:${scope}`, identity, limit);
}

export async function login(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Email and password are required." };
  if (password.length > 128) return { error: "Invalid email or password." };
  if (!(await allowAuthAttempt("login", email, 10))) {
    return { error: "Too many sign-in attempts. Please wait a minute and try again." };
  }

  if (!isDbEnabled) {
    if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
      await setSessionCookie(
        await signSession({
          userId: "u_demo",
          workspaceId: "ws_demo",
          email: DEMO_EMAIL,
          name: "Demo User",
        })
      );
      redirect("/dashboard");
    }
    return {
      error: "Demo mode: sign in with demo@vox.ai / demo1234 (set DATABASE_URL for real accounts).",
    };
  }

  const user = await findUserByEmail(email);
  if (!user || user.status !== "active" || !verifyPassword(password, user.passwordHash)) {
    return { error: "Invalid email or password." };
  }
  await setSessionCookie(
    await signSession({
      userId: user.id,
      workspaceId: user.workspaceId,
      email: user.email,
      name: user.name,
    })
  );
  redirect("/dashboard");
}

export async function signup(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const workspaceName = String(formData.get("workspace") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name || !email || !password) {
    return { error: "Name, email and password are required." };
  }
  if (!(await allowAuthAttempt("signup", email, 5))) {
    return { error: "Too many sign-up attempts. Please wait a minute and try again." };
  }
  if (name.length > 120 || workspaceName.length > 160 || email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid name, business name, and email address." };
  }
  if (password.length < 8 || password.length > 128) {
    return { error: "Password must be between 8 and 128 characters." };
  }
  if (!isDbEnabled) {
    return {
      error: "Sign-up requires a database. In demo mode, use demo@vox.ai / demo1234.",
    };
  }
  if (await findUserByEmail(email)) {
    return { error: "An account with that email already exists." };
  }

  let user;
  try {
    user = await createWorkspaceWithOwner({
      workspaceName: workspaceName || `${name}'s workspace`,
      email,
      name,
      passwordHash: hashPassword(password),
    });
  } catch (error) {
    // The unique database constraint is the final authority when two sign-ups
    // for the same email race each other.
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      return { error: "An account with that email already exists." };
    }
    throw error;
  }
  await setSessionCookie(
    await signSession({
      userId: user.id,
      workspaceId: user.workspaceId,
      email: user.email,
      name: user.name,
    })
  );
  redirect("/dashboard");
}

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}

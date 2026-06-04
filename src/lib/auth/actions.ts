"use server";

import { redirect } from "next/navigation";
import {
  findUserByEmail,
  createWorkspaceWithOwner,
  isDbEnabled,
} from "@/lib/repository";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/session";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth/session-cookies";

export type AuthState = { error?: string };

// Demo credentials used when no database is configured.
const DEMO_EMAIL = "demo@vox.ai";
const DEMO_PASSWORD = "demo1234";

export async function login(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Email and password are required." };

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
  if (!user || !verifyPassword(password, user.passwordHash)) {
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
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (!isDbEnabled) {
    return {
      error: "Sign-up requires a database. In demo mode, use demo@vox.ai / demo1234.",
    };
  }
  if (await findUserByEmail(email)) {
    return { error: "An account with that email already exists." };
  }

  const user = await createWorkspaceWithOwner({
    workspaceName: workspaceName || `${name}'s workspace`,
    email,
    name,
    passwordHash: hashPassword(password),
  });
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

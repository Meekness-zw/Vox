"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { acceptTeamInvitation } from "@/lib/repository";
import { hashPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/session";
import { setSessionCookie } from "@/lib/auth/session-cookies";

export async function acceptInvitation(token: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name || password.length < 8) throw new Error("Enter a name and password of at least 8 characters.");
  const user = await acceptTeamInvitation({
    tokenHash: createHash("sha256").update(token).digest("hex"),
    name,
    passwordHash: hashPassword(password),
  });
  if (!user) throw new Error("Could not create the account.");
  await setSessionCookie(await signSession({
    userId: user.id, workspaceId: user.workspaceId, email: user.email, name: user.name,
  }));
  redirect("/dashboard");
}

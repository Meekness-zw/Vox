"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session-cookies";
import {
  addAuditEvent,
  createTeamInvitation,
  saveCrmConnection,
} from "@/lib/repository";
import { encryptSecret } from "@/lib/token-crypto";

export async function createInvitation(formData: FormData) {
  const session = await requireSession();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "Agent");
  if (!email || !["Admin", "Agent"].includes(role)) throw new Error("Invalid invitation");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await createTeamInvitation({
    workspaceId: session.workspaceId,
    email,
    role,
    tokenHash,
    invitedBy: session.userId,
  });
  await addAuditEvent(session.workspaceId, session.email, "team.invited", { email, role });
  redirect(`/dashboard/settings?invite=${encodeURIComponent(token)}`);
}

export async function connectCrm(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "CRM webhook").trim();
  const webhookUrl = String(formData.get("webhookUrl") ?? "").trim();
  const secret = String(formData.get("secret") ?? "").trim();
  const parsed = new URL(webhookUrl);
  if (parsed.protocol !== "https:") throw new Error("CRM webhook must use HTTPS");
  await saveCrmConnection({
    workspaceId: session.workspaceId,
    name,
    webhookUrl,
    secretEncrypted: secret ? encryptSecret(secret) : undefined,
  });
  await addAuditEvent(session.workspaceId, session.email, "crm.connected", { name });
  revalidatePath("/dashboard/settings");
}

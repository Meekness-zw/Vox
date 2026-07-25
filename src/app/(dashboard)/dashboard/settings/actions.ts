"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session-cookies";
import {
  addAuditEvent,
  createTeamInvitation,
  findUserByEmail,
  revokeTeamInvitation,
  saveCrmConnection,
  updateWidgetConfig,
} from "@/lib/repository";
import { encryptSecret } from "@/lib/token-crypto";

async function requireManager() {
  const session = await requireSession();
  const user = await findUserByEmail(session.email);
  if (!user || !["Owner", "Admin"].includes(user.role)) throw new Error("Owner or Admin access required");
  return session;
}

export async function createInvitation(formData: FormData) {
  const session = await requireManager();
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
  const session = await requireManager();
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

export async function saveWidgetSettings(formData: FormData) {
  const session = await requireManager();
  const allowedDomains = String(formData.get("allowedDomains") ?? "")
    .split(/[\n,]/).map((v) => v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter(Boolean);
  await updateWidgetConfig({
    workspaceId: session.workspaceId,
    allowedDomains,
    title: String(formData.get("title") ?? "Chat with us").trim(),
    welcomeMessage: String(formData.get("welcomeMessage") ?? "Hi! How can I help?").trim(),
  });
  await addAuditEvent(session.workspaceId, session.email, "widget.updated", { allowedDomains });
  revalidatePath("/dashboard/settings");
}

export async function revokeInvitation(formData: FormData) {
  const session = await requireManager();
  const id = String(formData.get("id") ?? "");
  await revokeTeamInvitation(id, session.workspaceId);
  await addAuditEvent(session.workspaceId, session.email, "team.invitation_revoked", { id });
  revalidatePath("/dashboard/settings");
}

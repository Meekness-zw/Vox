"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isVoxAdmin } from "@/lib/admin";
import { requireSession } from "@/lib/auth/session-cookies";
import {
  createBotRequest,
  getWorkspaceSubscription,
  updateWorkspaceSubscription,
  upsertCompanyProfile,
} from "@/lib/repository";
import type { BotRequest, SubscriptionStatus } from "@/lib/types";

async function requireAdmin() {
  const session = await requireSession();
  if (!isVoxAdmin(session.email)) throw new Error("Vox administrator access required.");
}

export async function updateClientSubscription(formData: FormData) {
  await requireAdmin();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const plan = String(formData.get("plan") ?? "free");
  const status = String(formData.get("status") ?? "free") as SubscriptionStatus;
  const due = String(formData.get("dueAt") ?? "");
  if (!workspaceId) throw new Error("Workspace is required.");
  await updateWorkspaceSubscription({
    workspaceId,
    plan,
    status,
    dueAt: due ? new Date(`${due}T23:59:59Z`).toISOString() : undefined,
  });
  revalidatePath("/dashboard/admin/clients");
}

export async function createManagedBotRequest(formData: FormData) {
  await requireAdmin();
  const value = (name: string) => String(formData.get(name) ?? "").trim();
  const workspaceId = value("workspaceId");
  if (!workspaceId || !value("businessName") || !value("services")) {
    throw new Error("Client, business name, and services are required.");
  }
  const subscription = await getWorkspaceSubscription(workspaceId);
  const now = new Date().toISOString();
  const request: BotRequest = {
    id: `br_${crypto.randomUUID()}`,
    workspaceId,
    businessName: value("businessName"),
    industry: value("industry"),
    description: value("description"),
    services: value("services"),
    businessHours: value("businessHours"),
    languages: value("languages") || "English",
    tone: value("tone") || "Friendly, professional, and concise",
    escalation: value("escalation") || "Collect contact details for a human follow-up.",
    channels: formData.getAll("channels").map(String),
    contactName: "Vox Admin",
    contactEmail: value("clientEmail"),
    status: subscription.status === "active" ? "submitted" : "payment_required",
    adminNotes: subscription.status === "active"
      ? "Company profile entered by Vox admin."
      : "Company profile saved. Payment is required before the bot can be built.",
    createdAt: now,
    updatedAt: now,
  };
  await createBotRequest(request);
  await upsertCompanyProfile({
    workspaceId,
    businessName: request.businessName,
    industry: request.industry,
    description: request.description,
    services: request.services,
    businessHours: request.businessHours,
    languages: request.languages,
    tone: request.tone,
    escalation: request.escalation,
    updatedAt: now,
  });
  redirect(`/dashboard/admin/requests/${request.id}`);
}

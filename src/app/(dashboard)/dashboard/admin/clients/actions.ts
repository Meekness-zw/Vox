"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isVoxAdmin } from "@/lib/admin";
import { requireSession } from "@/lib/auth/session-cookies";
import { isDbEnabled } from "@/lib/db";
import {
  addAuditEvent,
  createBotRequest,
  getWorkspaceSubscription,
  releasePaidBotRequests,
  updateWorkspaceSubscription,
  upsertCompanyProfile,
  workspaceExists,
} from "@/lib/repository";
import type { BotRequest, SubscriptionStatus } from "@/lib/types";
import { isValidBusinessSchedule, isValidTimezone } from "@/lib/business-schedule";

async function requireAdmin() {
  const session = await requireSession();
  if (!isVoxAdmin(session.email)) throw new Error("Vox administrator access required.");
  if (!isDbEnabled) throw new Error("The admin dashboard requires DATABASE_URL.");
  return session;
}

export async function setClientPaidStatus(formData: FormData) {
  const session = await requireAdmin();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const paid = String(formData.get("paid") ?? "") === "true";
  if (!workspaceId) throw new Error("Workspace is required.");
  const current = await getWorkspaceSubscription(workspaceId);
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + 30);
  await updateWorkspaceSubscription({
    workspaceId,
    plan: paid ? (current.plan === "free" ? "starter" : current.plan) : "free",
    status: paid ? "active" : "free",
    dueAt: paid ? dueAt.toISOString() : undefined,
  });
  if (paid) await releasePaidBotRequests(workspaceId);
  await addAuditEvent(
    workspaceId,
    session.email,
    paid ? "subscription.marked_paid" : "subscription.moved_to_free",
    { previousPlan: current.plan, previousStatus: current.status }
  );
  revalidatePath("/dashboard/admin/clients");
  revalidatePath("/dashboard/admin/requests");
}

export async function updateClientSubscription(formData: FormData) {
  await requireAdmin();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const plan = String(formData.get("plan") ?? "free");
  const status = String(formData.get("status") ?? "free") as SubscriptionStatus;
  const due = String(formData.get("dueAt") ?? "");
  if (!workspaceId) throw new Error("Workspace is required.");
  if (!["free", "starter", "growth", "pro", "enterprise"].includes(plan) ||
      !["free", "active", "past_due", "cancelled"].includes(status)) {
    throw new Error("Invalid subscription details.");
  }
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
  if (!(await workspaceExists(workspaceId))) throw new Error("Client workspace not found.");
  const subscription = await getWorkspaceSubscription(workspaceId);
  let businessSchedule: BotRequest["businessSchedule"] = [];
  try { businessSchedule = JSON.parse(value("businessSchedule")); } catch {}
  const timezone = value("timezone") || "Africa/Harare";
  if (!isValidTimezone(timezone)) {
    throw new Error("Select a valid business timezone.");
  }
  if (!isValidBusinessSchedule(businessSchedule)) {
    throw new Error("A complete business schedule is required.");
  }
  const channels = formData.getAll("channels").map(String);
  if (!channels.length || channels.some((channel) => !["WhatsApp", "Website chat", "Phone calls", "SMS"].includes(channel))) {
    throw new Error("Select at least one valid channel.");
  }
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
    timezone,
    businessSchedule,
    channels,
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
    timezone,
    businessSchedule,
    updatedAt: now,
  });
  redirect(`/dashboard/admin/requests/${request.id}`);
}

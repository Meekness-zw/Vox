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
} from "@/lib/repository";
import type { BotRequest, SubscriptionStatus } from "@/lib/types";

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
  let businessSchedule: BotRequest["businessSchedule"] = [];
  try { businessSchedule = JSON.parse(value("businessSchedule")); } catch {}
  const timezone = value("timezone") || "Africa/Harare";
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch {
    throw new Error("Select a valid business timezone.");
  }
  if (!Array.isArray(businessSchedule) || businessSchedule.length !== 7) {
    throw new Error("A complete business schedule is required.");
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
    timezone,
    businessSchedule,
    updatedAt: now,
  });
  redirect(`/dashboard/admin/requests/${request.id}`);
}

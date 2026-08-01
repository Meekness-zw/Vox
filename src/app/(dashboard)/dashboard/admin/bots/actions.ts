"use server";

import { revalidatePath } from "next/cache";
import { isVoxAdmin } from "@/lib/admin";
import { requireSession } from "@/lib/auth/session-cookies";
import { updateAdminAgentState } from "@/lib/repository";
import type { Agent, BotBillingStatus } from "@/lib/types";

export async function updateBotManagement(formData: FormData) {
  const session = await requireSession();
  if (!isVoxAdmin(session.email)) throw new Error("Vox administrator access required.");
  const agentId = String(formData.get("agentId") ?? "");
  const status = String(formData.get("status") ?? "draft") as Agent["status"];
  const billingStatus = String(formData.get("billingStatus") ?? "unpaid") as BotBillingStatus;
  const amount = Number(formData.get("monthlyPrice") ?? 0);
  const paidThrough = String(formData.get("paidThrough") ?? "").trim();
  if (!agentId || !["active", "paused", "draft"].includes(status) ||
      !["trial", "paid", "unpaid", "past_due", "cancelled"].includes(billingStatus) ||
      !Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
    throw new Error("Invalid bot management values.");
  }
  await updateAdminAgentState({ agentId, status, billingStatus, priceCents: Math.round(amount * 100), paidThrough: paidThrough ? new Date(`${paidThrough}T23:59:59Z`).toISOString() : undefined });
  revalidatePath("/dashboard/admin/bots");
}

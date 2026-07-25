"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isVoxAdmin } from "@/lib/admin";
import { requireSession } from "@/lib/auth/session-cookies";
import { ingestSource } from "@/lib/rag";
import { isDbEnabled } from "@/lib/db";
import { getBotRequest, getAgentById, getWorkspaceSubscription, updateAgentBilling, updateBotRequest, upsertAgent } from "@/lib/repository";
import { plans } from "@/lib/pricing";
import { requestPythonBuild } from "@/lib/python-bot";
import type { Agent, BotRequestStatus } from "@/lib/types";

async function adminSession() {
  const session = await requireSession();
  if (!isVoxAdmin(session.email)) throw new Error("Vox administrator access required.");
  return session;
}

export async function buildRequestedBot(formData: FormData) {
  await adminSession();
  const id = String(formData.get("id") ?? "");
  const request = await getBotRequest(id);
  if (!request) throw new Error("Bot request not found.");
  const subscription = await getWorkspaceSubscription(request.workspaceId);
  if (subscription.status !== "active") {
    throw new Error("This client has not paid for a custom bot yet. Activate the subscription before building.");
  }
  await updateBotRequest({ id, status: "building", adminNotes: "Vox is generating the first bot configuration." });
  const built = await requestPythonBuild({
    businessName: request.businessName,
    industry: request.industry,
    description: request.description,
    services: request.services,
    businessHours: request.businessHours,
    languages: request.languages,
    tone: request.tone,
    escalation: request.escalation,
  });
  const agentId = request.agentId ?? `ag_${crypto.randomUUID()}`;
  const agent: Agent = {
    id: agentId,
    name: built.name,
    type: request.channels.includes("Phone calls") ? "voice" : "chat",
    status: "draft",
    language: request.languages,
    voice: "Micheal — calm, professional",
    personality: built.personality,
    systemPrompt: built.systemPrompt,
    greeting: built.greeting,
    businessHours: request.businessHours,
    escalation: request.escalation,
    createdAt: new Date().toISOString(),
  };
  await upsertAgent(agent, request.workspaceId);
  const selectedPlan = plans.find((plan) => plan.id === subscription.plan);
  await updateAgentBilling({
    agentId,
    billingStatus: "paid",
    priceCents: (selectedPlan?.price ?? 0) * 100,
    paidThrough: subscription.dueAt,
  });
  if (isDbEnabled) {
    await ingestSource({ workspaceId: request.workspaceId, name: `${request.businessName} onboarding`, type: "Manual Q&A", content: built.knowledge });
  }
  await updateBotRequest({ id, status: "testing", agentId, adminNotes: "First build complete. Vox is testing and refining the bot." });
  redirect(`/dashboard/admin/requests/${id}`);
}

export async function updateRequestWorkflow(formData: FormData) {
  await adminSession();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "under_review") as BotRequestStatus;
  const adminNotes = String(formData.get("adminNotes") ?? "").trim();
  const request = await getBotRequest(id);
  if (!request) throw new Error("Bot request not found.");
  if (status === "live") {
    if (!request.agentId) throw new Error("Build the bot before publishing it.");
    const agent = await getAgentById(request.agentId, request.workspaceId);
    if (!agent) throw new Error("Generated agent not found.");
    await upsertAgent({ ...agent, status: "active" }, request.workspaceId);
  }
  await updateBotRequest({ id, status, agentId: request.agentId, adminNotes });
  revalidatePath(`/dashboard/admin/requests/${id}`);
  revalidatePath("/dashboard/admin/requests");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isVoxAdmin } from "@/lib/admin";
import { requireSession } from "@/lib/auth/session-cookies";
import { ingestSource } from "@/lib/rag";
import { isDbEnabled } from "@/lib/db";
import { getAdminBotRequest, getAgentById, getCompanyProfile, getWorkspaceSubscription, updateAgentBilling, updateBotRequest, upsertAgent, upsertCompanyProfile, upsertPhoneNumber } from "@/lib/repository";
import { plans } from "@/lib/pricing";
import { requestPythonBuild } from "@/lib/python-bot";
import type { Agent, BotRequestStatus } from "@/lib/types";

async function adminSession() {
  const session = await requireSession();
  if (!isVoxAdmin(session.email)) throw new Error("Vox administrator access required.");
  if (!isDbEnabled) throw new Error("The admin dashboard requires DATABASE_URL.");
  return session;
}

export async function buildRequestedBot(formData: FormData) {
  await adminSession();
  const id = String(formData.get("id") ?? "");
  const request = await getAdminBotRequest(id);
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
  const request = await getAdminBotRequest(id);
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

export async function provisionClientNumbers(formData: FormData) {
  await adminSession();
  const id = String(formData.get("id") ?? "");
  const routingPhone = String(formData.get("routingPhone") ?? "").replace(/[^\d+]/g, "");
  const request = await getAdminBotRequest(id);
  if (!request?.agentId) throw new Error("Build the bot before assigning numbers.");
  if (!/^\+\d{8,15}$/.test(routingPhone)) throw new Error("Enter a valid Twilio routing number.");
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio is not configured.");
  const authorization = `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
  const found = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(routingPhone)}`, { headers: { authorization } });
  const data = await found.json();
  const numberSid = data.incoming_phone_numbers?.[0]?.sid;
  if (!numberSid) throw new Error("That number is not owned by this Twilio account.");
  const voiceUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://vox-rust-six.vercel.app"}/api/voice/incoming`;
  const configured = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers/${numberSid}.json`, {
    method: "POST", headers: { authorization, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ VoiceUrl: voiceUrl, VoiceMethod: "POST" }),
  });
  if (!configured.ok) throw new Error("Twilio rejected the webhook configuration.");
  await upsertPhoneNumber({ id: `pn_${crypto.randomUUID()}`, number: routingPhone, channel: "voice", agentId: request.agentId }, request.workspaceId);
  if (request.whatsappPhone) await upsertPhoneNumber({ id: `pn_${crypto.randomUUID()}`, number: request.whatsappPhone, channel: "whatsapp", agentId: request.agentId }, request.workspaceId);
  const profile = await getCompanyProfile(request.workspaceId);
  if (profile) await upsertCompanyProfile({ ...profile, routingPhone, updatedAt: new Date().toISOString() });
  revalidatePath(`/dashboard/admin/requests/${id}`);
}

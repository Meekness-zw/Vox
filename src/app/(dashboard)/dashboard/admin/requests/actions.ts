"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isVoxAdmin } from "@/lib/admin";
import { requireSession } from "@/lib/auth/session-cookies";
import { ingestSource } from "@/lib/rag";
import { isDbEnabled } from "@/lib/db";
import { addAuditEvent, getAdminBotRequest, getAgentById, getCompanyProfile, getWorkspaceSubscription, updateAgentBilling, updateBotRequest, updateBotRequestNumber, updateManagedBusinessSchedule, updateWhatsAppOnboarding, upsertAgent, upsertCompanyProfile, upsertPhoneNumber } from "@/lib/repository";
import { plans } from "@/lib/pricing";
import { requestPythonBuild } from "@/lib/python-bot";
import type { Agent, BotRequestStatus } from "@/lib/types";
import { configureOwnedVoiceNumber, configureWhatsAppWebhook, getWhatsAppSender, purchaseVoiceNumber, releaseVoiceNumber, startWhatsAppSender, verifyWhatsAppSender } from "@/lib/twilio-admin";
import { isValidBusinessSchedule, isValidTimezone } from "@/lib/business-schedule";

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
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "The bot build failed.";
    await updateBotRequest({ id, status: "changes_requested", adminNotes: `Build failed: ${message.slice(0, 500)}` });
    throw error;
  }
  redirect(`/dashboard/admin/requests/${id}`);
}

export async function updateRequestWorkflow(formData: FormData) {
  await adminSession();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "under_review") as BotRequestStatus;
  const adminNotes = String(formData.get("adminNotes") ?? "").trim();
  const request = await getAdminBotRequest(id);
  if (!request) throw new Error("Bot request not found.");
  if (!("payment_required submitted under_review building testing changes_requested approved live".split(" ") as string[]).includes(status)) {
    throw new Error("Invalid workflow status.");
  }
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
  const session = await adminSession();
  const id = String(formData.get("id") ?? "");
  const routingPhone = String(formData.get("routingPhone") ?? "").replace(/[^\d+]/g, "");
  const request = await getAdminBotRequest(id);
  if (!request?.agentId) throw new Error("Build the bot before assigning numbers.");
  if (!/^\+\d{8,15}$/.test(routingPhone)) throw new Error("Enter a valid Twilio routing number.");
  const owned = await configureOwnedVoiceNumber(
    routingPhone,
    `Vox · ${request.businessName}`,
    request.channels.includes("SMS")
  );
  if (request.channels.includes("SMS") && owned.capabilities?.sms === false) {
    throw new Error("This Twilio number cannot send SMS. Choose an SMS-capable number for this bot.");
  }
  await upsertPhoneNumber({ id: `pn_${crypto.randomUUID()}`, number: routingPhone, channel: "voice", agentId: request.agentId }, request.workspaceId);
  await updateBotRequestNumber({ id, channel: "voice", number: routingPhone });
  const profile = await getCompanyProfile(request.workspaceId);
  if (profile) await upsertCompanyProfile({ ...profile, routingPhone, updatedAt: new Date().toISOString() });
  await addAuditEvent(request.workspaceId, session.email, "twilio.voice_number_connected", { routingPhone });
  revalidatePath(`/dashboard/admin/requests/${id}`);
}

export async function purchaseClientVoiceNumber(formData: FormData) {
  const session = await adminSession();
  const id = String(formData.get("id") ?? "");
  const country = String(formData.get("country") ?? "US");
  const areaCode = String(formData.get("areaCode") ?? "");
  const request = await getAdminBotRequest(id);
  if (!request?.agentId) throw new Error("Build the bot before purchasing a number.");
  if (request.routingPhone) throw new Error("This bot already has a voice number assigned.");
  const purchased = await purchaseVoiceNumber({
    country,
    areaCode,
    friendlyName: `Vox · ${request.businessName}`,
    smsEnabled: request.channels.includes("SMS"),
  });
  const routingPhone = purchased.phone_number;
  try {
    await upsertPhoneNumber({ id: `pn_${crypto.randomUUID()}`, number: routingPhone, channel: "voice", agentId: request.agentId }, request.workspaceId);
    await updateBotRequestNumber({ id, channel: "voice", number: routingPhone });
    const profile = await getCompanyProfile(request.workspaceId);
    if (profile) await upsertCompanyProfile({ ...profile, routingPhone, updatedAt: new Date().toISOString() });
    await addAuditEvent(request.workspaceId, session.email, "twilio.voice_number_purchased", { routingPhone, country });
  } catch (error) {
    await releaseVoiceNumber(purchased.sid).catch(() => undefined);
    throw new Error("The number was purchased but could not be assigned, so Vox released it. Please try again.", { cause: error });
  }
  revalidatePath(`/dashboard/admin/requests/${id}`);
}

async function activateWhatsAppRoute(id: string, senderSid: string, actorEmail: string) {
  const request = await getAdminBotRequest(id);
  if (!request?.agentId || !request.whatsappPhone) throw new Error("Build the bot and add its WhatsApp number first.");
  const sender = await configureWhatsAppWebhook(senderSid);
  const senderPhone = sender.sender_id.replace(/^whatsapp:/, "");
  if (senderPhone !== request.whatsappPhone) {
    throw new Error("That Twilio WhatsApp sender belongs to a different phone number.");
  }
  if (sender.status.toUpperCase() !== "ONLINE") {
    await updateWhatsAppOnboarding({ id, senderSid, senderStatus: sender.status });
    throw new Error(`WhatsApp sender is ${sender.status}. Wait for Meta/Twilio approval, then refresh its status.`);
  }
  await upsertPhoneNumber({ id: `pn_${crypto.randomUUID()}`, number: request.whatsappPhone, channel: "whatsapp", agentId: request.agentId }, request.workspaceId);
  await updateBotRequestNumber({ id, channel: "whatsapp", number: request.whatsappPhone });
  await updateWhatsAppOnboarding({ id, senderSid, senderStatus: sender.status });
  const profile = await getCompanyProfile(request.workspaceId);
  if (profile) await upsertCompanyProfile({ ...profile, whatsappPhone: request.whatsappPhone, updatedAt: new Date().toISOString() });
  await addAuditEvent(request.workspaceId, actorEmail, "twilio.whatsapp_sender_connected", { senderSid, whatsappPhone: request.whatsappPhone });
}

export async function startClientWhatsAppOnboarding(formData: FormData) {
  const session = await adminSession();
  const id = String(formData.get("id") ?? "");
  const wabaId = String(formData.get("wabaId") ?? "").trim();
  const verificationMethod = String(formData.get("verificationMethod") ?? "sms") as "sms" | "voice";
  const request = await getAdminBotRequest(id);
  if (!request?.agentId || !request.whatsappPhone) throw new Error("Build the bot and provide the client's WhatsApp number first.");
  if (!/^\d{5,30}$/.test(wabaId)) throw new Error("Enter the Meta WhatsApp Business Account ID.");
  if (!(["sms", "voice"] as const).includes(verificationMethod)) throw new Error("Select SMS or voice verification.");
  const sender = await startWhatsAppSender({
    phoneNumber: request.whatsappPhone,
    wabaId,
    displayName: request.businessName,
    verificationMethod,
  });
  await updateWhatsAppOnboarding({ id, senderSid: sender.sid, senderStatus: sender.status });
  await addAuditEvent(request.workspaceId, session.email, "twilio.whatsapp_registration_started", { senderSid: sender.sid, status: sender.status });
  revalidatePath(`/dashboard/admin/requests/${id}`);
}

export async function verifyClientWhatsAppSender(formData: FormData) {
  const session = await adminSession();
  const id = String(formData.get("id") ?? "");
  const verificationCode = String(formData.get("verificationCode") ?? "").trim();
  const request = await getAdminBotRequest(id);
  if (!request?.whatsappSenderSid) throw new Error("Start WhatsApp registration first.");
  const sender = await verifyWhatsAppSender(request.whatsappSenderSid, verificationCode);
  await updateWhatsAppOnboarding({ id, senderSid: sender.sid, senderStatus: sender.status });
  if (sender.status.toUpperCase() === "ONLINE") {
    await activateWhatsAppRoute(id, sender.sid, session.email);
  }
  revalidatePath(`/dashboard/admin/requests/${id}`);
}

export async function refreshClientWhatsAppSender(formData: FormData) {
  const session = await adminSession();
  const id = String(formData.get("id") ?? "");
  const enteredSid = String(formData.get("senderSid") ?? "").trim();
  const request = await getAdminBotRequest(id);
  const senderSid = enteredSid || request?.whatsappSenderSid;
  if (!request || !senderSid) throw new Error("Enter or register a WhatsApp sender SID first.");
  const sender = await getWhatsAppSender(senderSid);
  await updateWhatsAppOnboarding({ id, senderSid: sender.sid, senderStatus: sender.status });
  if (sender.status.toUpperCase() === "ONLINE") {
    await activateWhatsAppRoute(id, sender.sid, session.email);
  }
  revalidatePath(`/dashboard/admin/requests/${id}`);
}

export async function updateClientBusinessSchedule(formData: FormData) {
  const session = await adminSession();
  const id = String(formData.get("id") ?? "");
  const businessHours = String(formData.get("businessHours") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "Africa/Harare").trim();
  let businessSchedule: Array<{ day: string; enabled: boolean; opens: string; closes: string }> = [];
  try { businessSchedule = JSON.parse(String(formData.get("businessSchedule") ?? "[]")); } catch {}
  const request = await getAdminBotRequest(id);
  if (!request) throw new Error("Bot request not found.");
  if (!isValidTimezone(timezone)) {
    throw new Error("Select a valid business timezone.");
  }
  if (!businessHours || !isValidBusinessSchedule(businessSchedule)) {
    throw new Error("Check the selected business days and times.");
  }
  await updateManagedBusinessSchedule({
    requestId: id,
    workspaceId: request.workspaceId,
    businessHours,
    timezone,
    businessSchedule,
  });
  await addAuditEvent(request.workspaceId, session.email, "calendar.business_schedule_updated", { timezone, businessSchedule });
  revalidatePath(`/dashboard/admin/requests/${id}`);
}

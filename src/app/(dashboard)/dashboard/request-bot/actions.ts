"use server";

import { redirect } from "next/navigation";
import { requireWorkspaceManager } from "@/lib/auth/session-cookies";
import { createBotRequestWithCompanyProfile, getWorkspaceSubscription } from "@/lib/repository";
import type { BotRequest } from "@/lib/types";
import { isValidBusinessSchedule, isValidTimezone } from "@/lib/business-schedule";

export type RequestState = { error?: string };

export async function submitBotRequest(
  _state: RequestState,
  formData: FormData
): Promise<RequestState> {
  const session = await requireWorkspaceManager();
  const value = (name: string) => String(formData.get(name) ?? "").trim();
  const required = ["businessName", "industry", "description", "services", "businessHours"];
  if (required.some((name) => !value(name))) {
    return { error: "Please complete the business, services, and hours fields." };
  }
  const now = new Date().toISOString();
  const phone = (name: string) => {
    const normalized = value(name).replace(/[^\d+]/g, "");
    return /^\+\d{8,15}$/.test(normalized) ? normalized : "";
  };
  let businessSchedule: BotRequest["businessSchedule"] = [];
  try { businessSchedule = JSON.parse(value("businessSchedule")); } catch {}
  const timezone = value("timezone") || "Africa/Harare";
  if (!isValidTimezone(timezone)) {
    return { error: "Please select a valid business timezone." };
  }
  if (!isValidBusinessSchedule(businessSchedule)) {
    return { error: "Please check the selected business days and opening times." };
  }
  const channels = formData.getAll("channels").map(String);
  if (!channels.length || channels.some((channel) => !["WhatsApp", "Website chat", "Phone calls", "SMS"].includes(channel))) {
    return { error: "Please select at least one valid bot channel." };
  }
  const limits: Array<[string, number]> = [["businessName", 120], ["industry", 120], ["description", 10_000], ["services", 20_000], ["businessHours", 1_000], ["languages", 200], ["tone", 1_000], ["escalation", 2_000]];
  if (limits.some(([field, maximum]) => value(field).length > maximum)) return { error: "One or more company information fields are too long." };
  if (!phone("companyPhone") || !phone("transferPhone") || !phone("whatsappPhone")) {
    return { error: "Please enter valid company, transfer, and WhatsApp numbers with country codes." };
  }
  const subscription = await getWorkspaceSubscription(session.workspaceId);
  const isPaid = subscription.status === "active";
  const request: BotRequest = {
    id: `br_${crypto.randomUUID()}`,
    workspaceId: session.workspaceId,
    businessName: value("businessName"),
    industry: value("industry"),
    description: value("description"),
    services: value("services"),
    businessHours: value("businessHours"),
    languages: value("languages") || "English",
    tone: value("tone") || "Friendly, professional, and concise",
    escalation: value("escalation") || "Take contact details and notify a human team member.",
    companyPhone: phone("companyPhone"),
    transferPhone: phone("transferPhone"),
    whatsappPhone: phone("whatsappPhone"),
    timezone,
    businessSchedule,
    channels,
    contactName: session.name,
    contactEmail: session.email,
    status: isPaid ? "submitted" : "payment_required",
    adminNotes: "",
    createdAt: now,
    updatedAt: now,
  };
  await createBotRequestWithCompanyProfile(request, {
    workspaceId: session.workspaceId,
    businessName: request.businessName,
    industry: request.industry,
    description: request.description,
    services: request.services,
    businessHours: request.businessHours,
    languages: request.languages,
    tone: request.tone,
    escalation: request.escalation,
    companyPhone: request.companyPhone,
    transferPhone: request.transferPhone,
    whatsappPhone: request.whatsappPhone,
    timezone,
    businessSchedule,
    updatedAt: now,
  });
  redirect(isPaid
    ? "/dashboard/request-bot?submitted=1"
    : `/dashboard/billing?required=1&botRequest=${request.id}`);
}

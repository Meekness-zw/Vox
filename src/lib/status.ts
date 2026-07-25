import { isDbEnabled } from "@/lib/db";
import { hasModelCredentials, DEFAULT_MODEL } from "@/lib/agent-runtime";
import { hasCalendarCredentials } from "@/lib/calendar";
import { hasEmailCredentials } from "@/lib/invoices";
import { getCalendarConnection } from "@/lib/repository";

export type ServiceStatus = {
  key: "model" | "database" | "voice" | "whatsapp" | "calendar" | "email";
  label: string;
  connected: boolean;
  detail: string;
};

export async function getSystemStatus(workspaceId = "ws_demo"): Promise<ServiceStatus[]> {
  const modelConnected = hasModelCredentials();
  const voiceConnected = Boolean(process.env.TWILIO_ACCOUNT_SID);
  const whatsappConnected = Boolean(process.env.TWILIO_WHATSAPP_NUMBER);
  const emailConnected = hasEmailCredentials();
  const calendarConnection = hasCalendarCredentials()
    ? await getCalendarConnection(workspaceId)
    : null;

  return [
    {
      key: "model",
      label: "AI model",
      connected: modelConnected,
      detail: modelConnected
        ? `Live via AI Gateway · ${DEFAULT_MODEL}`
        : "Demo responder (set AI_GATEWAY_API_KEY)",
    },
    {
      key: "database",
      label: "Database",
      connected: isDbEnabled,
      detail: isDbEnabled
        ? "Postgres connected"
        : "In-memory demo data (set DATABASE_URL)",
    },
    {
      key: "voice",
      label: "Voice telephony",
      connected: voiceConnected,
      detail: voiceConnected
        ? "Twilio connected"
        : "Webhooks ready (connect a Twilio number)",
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      connected: whatsappConnected,
      detail: whatsappConnected
        ? "Twilio WhatsApp connected"
        : "Webhooks ready (connect a Twilio WhatsApp sender)",
    },
    {
      key: "calendar",
      label: "Calendar booking",
      connected: Boolean(calendarConnection),
      detail: calendarConnection
        ? "Google Calendar connected"
        : "Naive availability (connect Google Calendar in Settings)",
    },
    {
      key: "email",
      label: "Invoice email",
      connected: emailConnected,
      detail: emailConnected
        ? "Live via Resend"
        : "Invoices created, not emailed (set RESEND_API_KEY)",
    },
  ];
}

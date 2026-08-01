import { isDbEnabled } from "@/lib/db";
import { hasModelCredentials, DEFAULT_MODEL } from "@/lib/agent-runtime";
import { hasCalendarCredentials } from "@/lib/calendar";
import { hasEmailCredentials } from "@/lib/invoices";
import { getCalendarConnection, getWorkspaceSendingNumber } from "@/lib/repository";

export type ServiceStatus = {
  key: "model" | "database" | "voice" | "whatsapp" | "calendar" | "email";
  label: string;
  connected: boolean;
  detail: string;
};

type BotHealth = {
  model_connected?: boolean;
  model_provider?: string;
  model?: string;
};

async function getBotHealth(): Promise<BotHealth | null> {
  const baseUrl = process.env.VOX_BOT_SERVICE_URL?.trim().replace(/\/$/, "");
  if (!baseUrl) return null;
  try {
    const response = await fetch(`${baseUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    return response.ok ? (await response.json()) as BotHealth : null;
  } catch {
    return null;
  }
}

export async function getSystemStatus(workspaceId = "ws_demo"): Promise<ServiceStatus[]> {
  const gatewayConnected = hasModelCredentials();
  const twilioConnected = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  const [voiceNumber, whatsappNumber, botHealth] = await Promise.all([
    getWorkspaceSendingNumber(workspaceId, "voice"),
    getWorkspaceSendingNumber(workspaceId, "whatsapp"),
    getBotHealth(),
  ]);
  const modelConnected = gatewayConnected || botHealth?.model_connected === true;
  const modelDetail = gatewayConnected
    ? `Live via AI Gateway · ${DEFAULT_MODEL}`
    : botHealth?.model_connected
      ? `Live via ${botHealth.model_provider ?? "Python bot service"} · ${botHealth.model ?? "configured model"}`
      : botHealth
        ? "Python bot is online but has no model key (set OPENAI_API_KEY on Railway)"
        : "Bot service unavailable (check VOX_BOT_SERVICE_URL)";
  const voiceConnected = twilioConnected && Boolean(voiceNumber);
  const whatsappConnected = twilioConnected && Boolean(whatsappNumber);
  const emailConnected = hasEmailCredentials();
  const calendarConnection = hasCalendarCredentials()
    ? await getCalendarConnection(workspaceId)
    : null;

  return [
    {
      key: "model",
      label: "AI model",
      connected: modelConnected,
      detail: modelDetail,
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
        : "Workspace schedule + Vox bookings (connect Google Calendar for external busy events)",
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

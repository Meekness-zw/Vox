import { isDbEnabled } from "@/lib/db";
import { hasModelCredentials, DEFAULT_MODEL } from "@/lib/agent-runtime";

export type ServiceStatus = {
  key: "model" | "database" | "voice";
  label: string;
  connected: boolean;
  detail: string;
};

export function getSystemStatus(): ServiceStatus[] {
  const modelConnected = hasModelCredentials();
  const voiceConnected = Boolean(process.env.TWILIO_ACCOUNT_SID);

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
  ];
}

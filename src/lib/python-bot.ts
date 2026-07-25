import type { Agent } from "./types";

export type BotMessage = { role: "user" | "assistant"; content: string };

const baseUrl = () =>
  (process.env.VOX_BOT_SERVICE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

function headers() {
  const token = process.env.VOX_BOT_SERVICE_TOKEN;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function requestPythonReply(input: {
  workspaceId: string;
  agent: Agent;
  messages: BotMessage[];
  knowledge?: string;
  channel?: "voice" | "chat" | "whatsapp" | "sms";
}): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}/v1/reply`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        workspace_id: input.workspaceId,
        agent: input.agent,
        messages: input.messages,
        knowledge: input.knowledge ?? "",
        channel: input.channel ?? (input.agent.type === "voice" ? "voice" : "chat"),
      }),
      signal: AbortSignal.timeout(28_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      `The Python bot engine is unavailable at ${baseUrl()}. Start bot-service before testing an agent.`,
      { cause: error }
    );
  }
  if (!response.ok) {
    throw new Error(`Python bot engine returned ${response.status}: ${await response.text()}`);
  }
  const result = (await response.json()) as { reply?: string };
  if (!result.reply?.trim()) throw new Error("Python bot engine returned an empty reply.");
  return result.reply.trim();
}

export type BuildBotInput = {
  businessName: string;
  industry: string;
  description: string;
  services: string;
  businessHours: string;
  languages: string;
  tone: string;
  escalation: string;
};

export type BuiltBot = {
  name: string;
  personality: string;
  greeting: string;
  systemPrompt: string;
  knowledge: string;
};

export async function requestPythonBuild(input: BuildBotInput): Promise<BuiltBot> {
  const response = await fetch(`${baseUrl()}/v1/build`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      business_name: input.businessName,
      industry: input.industry,
      description: input.description,
      services: input.services,
      business_hours: input.businessHours,
      languages: input.languages,
      tone: input.tone,
      escalation: input.escalation,
    }),
    signal: AbortSignal.timeout(28_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Python bot build failed (${response.status}).`);
  const result = (await response.json()) as Record<string, string>;
  return {
    name: result.name,
    personality: result.personality,
    greeting: result.greeting,
    systemPrompt: result.system_prompt,
    knowledge: result.knowledge,
  };
}

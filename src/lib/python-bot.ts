import type { Agent } from "./types";

export type BotMessage = { role: "user" | "assistant"; content: string };
export type PythonBotAction = {
  name:
    | "check_availability"
    | "book_appointment"
    | "create_invoice"
    | "create_business_document";
  arguments: Record<string, unknown>;
};
export type PythonBotReply = { reply: string; action?: PythonBotAction };

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
}): Promise<PythonBotReply> {
  const channel = input.channel ?? (input.agent.type === "voice" ? "voice" : "chat");
  // Messaging providers expect webhook responses promptly. Voice and dashboard
  // requests can tolerate a little longer because they have their own caller UI.
  const timeoutMs = channel === "whatsapp" || channel === "sms" ? 12_000 : 28_000;
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
        channel,
      }),
      signal: AbortSignal.timeout(timeoutMs),
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
  const result = (await response.json()) as {
    reply?: string;
    action?: PythonBotAction;
  };
  if (!result.reply?.trim() && !result.action) {
    throw new Error("Python bot engine returned neither a reply nor an action.");
  }
  return { reply: result.reply?.trim() ?? "", action: result.action };
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

export type PythonBusinessAnalysis = {
  title: string;
  report: string;
  sources: { title: string; url: string }[];
  model: string;
};

export async function requestBusinessAnalysis(input: {
  kind: "swot" | "sales_research";
  businessContext: string;
  query: string;
  financialSummary: string;
}): Promise<PythonBusinessAnalysis> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}/v1/business-analysis`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        kind: input.kind,
        business_context: input.businessContext,
        query: input.query,
        financial_summary: input.financialSummary,
      }),
      signal: AbortSignal.timeout(90_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error("The Python business research service is unavailable.", { cause: error });
  }
  if (!response.ok) {
    await response.text();
    throw new Error(
      response.status === 503
        ? "Business research is not configured on the Python service. Add OPENAI_API_KEY on Railway."
        : `Business research could not be completed (service status ${response.status}). Try again or check the Railway logs.`
    );
  }
  const result = await response.json() as PythonBusinessAnalysis;
  if (!result.report?.trim()) throw new Error("Business research returned an empty report.");
  const sources = Array.isArray(result.sources)
    ? result.sources.flatMap((source) => {
        try {
          const url = new URL(String(source?.url ?? ""));
          if (url.protocol !== "https:" && url.protocol !== "http:") return [];
          return [{
            title: String(source?.title ?? "Source").trim().slice(0, 300) || "Source",
            url: url.toString(),
          }];
        } catch {
          return [];
        }
      }).slice(0, 30)
    : [];
  return {
    title: String(result.title || "Business analysis").trim().slice(0, 300),
    report: result.report.trim(),
    sources,
    model: String(result.model || "unknown").slice(0, 100),
  };
}

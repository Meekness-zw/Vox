export type AgentType = "voice" | "chat";

export type Agent = {
  id: string;
  name: string;
  type: AgentType;
  status: "active" | "draft" | "paused";
  language: string;
  voice?: string;
  personality: string;
  systemPrompt: string;
  greeting: string;
  businessHours: string;
  escalation: string;
  createdAt: string;
};

export type Conversation = {
  id: string;
  agentId: string;
  channel: "voice" | "chat" | "sms" | "whatsapp";
  contact: string;
  startedAt: string;
  durationSec: number;
  sentiment: "positive" | "neutral" | "negative";
  outcome: "booked" | "lead" | "answered" | "transferred" | "missed";
  summary: string;
  actionItems: string[];
  transcript: { role: "agent" | "caller"; text: string }[];
};

export type KnowledgeSource = {
  id: string;
  name: string;
  type: "PDF" | "Document" | "FAQ" | "URL" | "CSV" | "Manual Q&A";
  status: "synced" | "syncing" | "error";
  chunks: number;
  updatedAt: string;
};

export type SmsCampaign = {
  id: string;
  name: string;
  type:
    | "Appointment confirmation"
    | "Appointment reminder"
    | "Follow-up"
    | "Lead nurturing"
    | "Re-engagement";
  status: "active" | "paused";
  sent: number;
  delivered: number;
  replied: number;
};

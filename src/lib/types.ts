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

export type Appointment = {
  id: string;
  agentId: string;
  conversationId?: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  service: string;
  startsAt: string;
  endsAt: string;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  googleEventId?: string;
  createdAt: string;
};

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  unitPriceCents: number;
};

export type ClientInvoice = {
  id: string;
  agentId?: string;
  conversationId?: string;
  contactName: string;
  contactEmail: string;
  lineItems: InvoiceLineItem[];
  subtotalCents: number;
  totalCents: number;
  status: "draft" | "sent" | "paid" | "void";
  notes?: string;
  createdAt: string;
  sentAt?: string;
};

export type BusinessDocumentType =
  | "invoice"
  | "receipt"
  | "quotation"
  | "delivery_order"
  | "purchase_order"
  | "credit_note";

export type BusinessDocumentStatus =
  | "draft"
  | "issued"
  | "sent"
  | "accepted"
  | "paid"
  | "fulfilled"
  | "void";

export type DocumentLineItem = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  sku?: string;
};

export type BusinessDocument = {
  id: string;
  agentId?: string;
  conversationId?: string;
  type: BusinessDocumentType;
  number: string;
  status: BusinessDocumentStatus;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  lineItems: DocumentLineItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  notes?: string;
  metadata: Record<string, string>;
  issueDate: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
};

export type DocumentTemplate = {
  businessName: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  currency: string;
  address: string;
  phone: string;
  email: string;
  taxNumber: string;
  footer: string;
  paymentTerms: string;
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

export type BotRequestStatus =
  | "payment_required"
  | "submitted"
  | "under_review"
  | "building"
  | "testing"
  | "changes_requested"
  | "approved"
  | "live";

export type BotRequest = {
  id: string;
  workspaceId: string;
  businessName: string;
  industry: string;
  description: string;
  services: string;
  businessHours: string;
  languages: string;
  tone: string;
  escalation: string;
  companyPhone?: string;
  routingPhone?: string;
  transferPhone?: string;
  whatsappPhone?: string;
  whatsappSenderSid?: string;
  whatsappSenderStatus?: string;
  timezone?: string;
  businessSchedule?: { day: string; enabled: boolean; opens: string; closes: string }[];
  channels: string[];
  contactName: string;
  contactEmail: string;
  status: BotRequestStatus;
  adminNotes: string;
  agentId?: string;
  createdAt: string;
  updatedAt: string;
};

export type BotBillingStatus = "trial" | "paid" | "unpaid" | "past_due" | "cancelled";

export type AdminBotRecord = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  clientEmail: string;
  name: string;
  type: AgentType;
  status: Agent["status"];
  billingStatus: BotBillingStatus;
  priceCents: number;
  paidThrough?: string;
  conversations: number;
  appointments: number;
  createdAt: string;
};

export type SubscriptionStatus = "free" | "active" | "past_due" | "cancelled";

export type AdminClientRecord = {
  workspaceId: string;
  workspaceName: string;
  plan: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionDueAt?: string;
  stripeCustomerId?: string;
  ownerName: string;
  ownerEmail: string;
  users: number;
  bots: number;
  createdAt: string;
};

export type CompanyProfile = {
  workspaceId: string;
  businessName: string;
  industry: string;
  description: string;
  services: string;
  businessHours: string;
  languages: string;
  tone: string;
  escalation: string;
  companyPhone?: string;
  routingPhone?: string;
  transferPhone?: string;
  whatsappPhone?: string;
  timezone?: string;
  businessSchedule?: { day: string; enabled: boolean; opens: string; closes: string }[];
  updatedAt: string;
};

export type AccountingAccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense";

export type BookkeepingEntry = {
  id: string;
  entryDate: string;
  description: string;
  reference?: string;
  direction: "income" | "expense" | "journal";
  amountCents: number;
  currency: string;
  createdBy: string;
  createdAt: string;
};

export type BookkeepingSummary = {
  currency: string;
  cashCents: number;
  revenueCents: number;
  expenseCents: number;
  profitCents: number;
  entryCount: number;
};

export type ResearchSource = { title: string; url: string };

export type BusinessAnalysis = {
  id: string;
  kind: "swot" | "sales_research";
  title: string;
  query: string;
  report: string;
  sources: ResearchSource[];
  model?: string;
  createdBy: string;
  createdAt: string;
};

import type {
  Agent,
  Appointment,
  ClientInvoice,
  Conversation,
  KnowledgeSource,
  SmsCampaign,
} from "./types";

/**
 * Demo data store. In production these reads would hit a database
 * (e.g. Neon Postgres via the Vercel Marketplace). Kept in-memory so the
 * dashboard is fully navigable without external services.
 */

export const agents: Agent[] = [
  {
    id: "ag_front_desk",
    name: "Front Desk Receptionist",
    type: "voice",
    status: "active",
    language: "English (US)",
    voice: "Micheal — calm, professional",
    personality: "Friendly, concise, reassuring",
    greeting:
      "Thanks for calling Bright Smile Dental, this is Micheal. How can I help you today?",
    businessHours: "Mon–Fri 8am–6pm, Sat 9am–1pm",
    escalation: "Transfer to front desk for billing disputes or emergencies.",
    systemPrompt:
      "You are Micheal, the AI phone receptionist for Bright Smile Dental. Answer questions about services, hours, and insurance, capture caller details, and book appointments. Keep replies short and natural for a phone call.",
    createdAt: "2026-04-12T10:00:00Z",
  },
  {
    id: "ag_web_chat",
    name: "Website Chat Concierge",
    type: "chat",
    status: "active",
    language: "Multi-language",
    personality: "Helpful, upbeat, on-brand",
    greeting: "Hi! 👋 I'm here to help. Looking to book a visit or ask a question?",
    businessHours: "24/7",
    escalation: "Hand off to a human agent when the visitor asks for a person.",
    systemPrompt:
      "You are the website concierge for Bright Smile Dental. Help visitors with services, pricing, and booking. Offer to capture their name and number for follow-up.",
    createdAt: "2026-04-14T09:30:00Z",
  },
  {
    id: "ag_after_hours",
    name: "After-Hours Voice Agent",
    type: "voice",
    status: "paused",
    language: "English (US)",
    voice: "Leo — calm, low",
    personality: "Calm, efficient",
    greeting:
      "You've reached Bright Smile Dental after hours. I can take a message or book you in.",
    businessHours: "After 6pm and weekends",
    escalation: "Send urgent dental emergencies to the on-call line.",
    systemPrompt:
      "You handle after-hours calls. Take messages, book non-urgent appointments, and route emergencies to the on-call number.",
    createdAt: "2026-05-02T20:00:00Z",
  },
];

export const conversations: Conversation[] = [
  {
    id: "cv_1029",
    agentId: "ag_front_desk",
    channel: "voice",
    contact: "+1 (415) 555-0142",
    startedAt: "2026-06-02T14:48:00Z",
    durationSec: 184,
    sentiment: "positive",
    outcome: "booked",
    summary:
      "New patient called to book a cleaning. Confirmed availability Thursday 10am and collected insurance provider.",
    actionItems: [
      "Send confirmation SMS for Thu 10:00am",
      "Verify Delta Dental coverage before visit",
    ],
    transcript: [
      { role: "agent", text: "Thanks for calling Bright Smile Dental, this is Micheal. How can I help?" },
      { role: "caller", text: "Hi, I'd like to book a cleaning sometime this week." },
      { role: "agent", text: "I can help with that. Are mornings or afternoons better for you?" },
      { role: "caller", text: "Mornings work best." },
      { role: "agent", text: "Great — I have Thursday at 10am open. Shall I book that?" },
      { role: "caller", text: "Perfect, yes." },
    ],
  },
  {
    id: "cv_1028",
    agentId: "ag_web_chat",
    channel: "chat",
    contact: "visitor_8821",
    startedAt: "2026-06-02T13:20:00Z",
    durationSec: 240,
    sentiment: "neutral",
    outcome: "lead",
    summary:
      "Visitor asked about teeth-whitening pricing and whether financing is available. Captured email for a follow-up quote.",
    actionItems: ["Email whitening price sheet", "Add to nurture sequence"],
    transcript: [
      { role: "caller", text: "How much is teeth whitening?" },
      { role: "agent", text: "In-office whitening starts at $349, and we offer financing. Want me to send details?" },
      { role: "caller", text: "Sure, my email is sam@example.com" },
    ],
  },
  {
    id: "cv_1027",
    agentId: "ag_front_desk",
    channel: "voice",
    contact: "+1 (628) 555-0199",
    startedAt: "2026-06-02T11:05:00Z",
    durationSec: 96,
    sentiment: "negative",
    outcome: "transferred",
    summary:
      "Caller frustrated about a billing charge. Agent de-escalated and transferred to the front desk.",
    actionItems: ["Front desk to review invoice #4821"],
    transcript: [
      { role: "caller", text: "I was charged twice and I'm not happy." },
      { role: "agent", text: "I'm sorry about that. Let me connect you with our billing team right away." },
    ],
  },
  {
    id: "cv_1026",
    agentId: "ag_web_chat",
    channel: "whatsapp",
    contact: "+1 (917) 555-0110",
    startedAt: "2026-06-01T19:42:00Z",
    durationSec: 130,
    sentiment: "positive",
    outcome: "booked",
    summary: "Returning patient rescheduled their cleaning via WhatsApp.",
    actionItems: ["Confirmation sent automatically"],
    transcript: [
      { role: "caller", text: "Need to move my Friday appt to next week" },
      { role: "agent", text: "No problem! I have Tuesday 2pm or Wednesday 9am available." },
      { role: "caller", text: "Tuesday 2pm" },
    ],
  },
  {
    id: "cv_1025",
    agentId: "ag_front_desk",
    channel: "voice",
    contact: "+1 (510) 555-0173",
    startedAt: "2026-06-01T16:10:00Z",
    durationSec: 0,
    sentiment: "neutral",
    outcome: "missed",
    summary: "Call dropped before connecting. Missed-call recovery SMS sent automatically.",
    actionItems: ["Recovery SMS delivered — awaiting reply"],
    transcript: [],
  },
];

export const knowledgeSources: KnowledgeSource[] = [
  { id: "kb_1", name: "Services & Pricing.pdf", type: "PDF", status: "synced", chunks: 42, updatedAt: "2026-05-30T10:00:00Z" },
  { id: "kb_2", name: "brightsmile.com", type: "URL", status: "synced", chunks: 118, updatedAt: "2026-06-01T08:00:00Z" },
  { id: "kb_3", name: "Insurance FAQ", type: "FAQ", status: "synced", chunks: 16, updatedAt: "2026-05-28T12:00:00Z" },
  { id: "kb_4", name: "patients-export.csv", type: "CSV", status: "syncing", chunks: 0, updatedAt: "2026-06-02T14:00:00Z" },
  { id: "kb_5", name: "After-hours protocol", type: "Manual Q&A", status: "synced", chunks: 9, updatedAt: "2026-05-20T09:00:00Z" },
];

export const appointments: Appointment[] = [
  {
    id: "ap_2201",
    agentId: "ag_front_desk",
    conversationId: "cv_1029",
    contactName: "Jamie Rivera",
    contactPhone: "+1 (415) 555-0142",
    service: "Cleaning",
    startsAt: "2026-06-05T17:00:00Z",
    endsAt: "2026-06-05T17:45:00Z",
    status: "confirmed",
    createdAt: "2026-06-02T14:51:00Z",
  },
  {
    id: "ap_2202",
    agentId: "ag_web_chat",
    conversationId: "cv_1026",
    contactName: "Returning patient",
    contactPhone: "+1 (917) 555-0110",
    service: "Cleaning (rescheduled)",
    startsAt: "2026-06-09T21:00:00Z",
    endsAt: "2026-06-09T21:45:00Z",
    status: "confirmed",
    createdAt: "2026-06-01T19:44:00Z",
  },
];

export const clientInvoices: ClientInvoice[] = [
  {
    id: "inv_3301",
    agentId: "ag_front_desk",
    conversationId: "cv_1029",
    contactName: "Jamie Rivera",
    contactEmail: "jamie.rivera@example.com",
    lineItems: [
      { description: "Routine cleaning", quantity: 1, unitPriceCents: 12000 },
    ],
    subtotalCents: 12000,
    totalCents: 12000,
    status: "sent",
    notes: "Thanks for visiting Bright Smile Dental!",
    createdAt: "2026-06-02T15:05:00Z",
    sentAt: "2026-06-02T15:05:00Z",
  },
];

export const smsCampaigns: SmsCampaign[] = [
  { id: "sms_1", name: "Visit confirmations", type: "Appointment confirmation", status: "active", sent: 1240, delivered: 1228, replied: 312 },
  { id: "sms_2", name: "24h reminders", type: "Appointment reminder", status: "active", sent: 980, delivered: 971, replied: 188 },
  { id: "sms_3", name: "No-show follow-up", type: "Follow-up", status: "active", sent: 214, delivered: 210, replied: 96 },
  { id: "sms_4", name: "Lapsed patient win-back", type: "Re-engagement", status: "paused", sent: 530, delivered: 521, replied: 74 },
];

// ---- Analytics (last 14 days) ------------------------------------------------
export const callVolumeSeries = [
  { day: "May 20", calls: 38, chats: 64 },
  { day: "May 21", calls: 42, chats: 71 },
  { day: "May 22", calls: 35, chats: 58 },
  { day: "May 23", calls: 51, chats: 80 },
  { day: "May 24", calls: 29, chats: 44 },
  { day: "May 25", calls: 22, chats: 39 },
  { day: "May 26", calls: 47, chats: 88 },
  { day: "May 27", calls: 53, chats: 92 },
  { day: "May 28", calls: 49, chats: 85 },
  { day: "May 29", calls: 58, chats: 101 },
  { day: "May 30", calls: 44, chats: 76 },
  { day: "May 31", calls: 31, chats: 52 },
  { day: "Jun 1", calls: 41, chats: 69 },
  { day: "Jun 2", calls: 56, chats: 97 },
];

export const outcomeBreakdown = [
  { name: "Appointments booked", value: 312, color: "#6d4aff" },
  { name: "Leads captured", value: 246, color: "#8b6dff" },
  { name: "Answered / resolved", value: 488, color: "#b9a6ff" },
  { name: "Transferred", value: 71, color: "#d8ccff" },
];

export const kpis = {
  callsAnswered: 1843,
  callsAnsweredDelta: 12.4,
  avgDurationSec: 168,
  avgDurationDelta: -4.1,
  conversionRate: 31.6,
  conversionDelta: 5.2,
  appointmentsBooked: 312,
  appointmentsDelta: 18.0,
  chatEngagement: 1097,
  chatEngagementDelta: 9.3,
  csat: 4.6,
  csatDelta: 0.2,
  agentUtilization: 72,
  agentUtilizationDelta: 6.5,
};

export function getAgent(id: string) {
  return agents.find((a) => a.id === id);
}

export function getConversation(id: string) {
  return conversations.find((c) => c.id === id);
}

export function getAppointment(id: string) {
  return appointments.find((a) => a.id === id);
}

export function getClientInvoice(id: string) {
  return clientInvoices.find((i) => i.id === id);
}

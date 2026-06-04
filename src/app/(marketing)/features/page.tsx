import type { Metadata } from "next";
import {
  Phone,
  MessageSquare,
  BookOpen,
  Send,
  Plug,
  BarChart3,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Everything in Vox: AI voice agents, chat agents, knowledge base training, SMS automation, integrations, and analytics.",
};

const sections = [
  {
    icon: Phone,
    title: "Voice Agent",
    groups: [
      {
        name: "AI Phone Receptionist",
        items: [
          "Answer inbound calls 24/7",
          "Transfer & route calls",
          "Capture leads",
          "Take messages",
          "FAQ answering",
          "Appointment scheduling",
        ],
      },
      {
        name: "Call Handling",
        items: [
          "Natural conversations",
          "Interruption handling",
          "Multi-turn conversations",
          "Context memory",
          "Sentiment detection",
        ],
      },
      {
        name: "Call Intelligence",
        items: [
          "Call recording",
          "Call summaries",
          "Action items",
          "Transcripts",
          "Missed-call recovery",
        ],
      },
    ],
  },
  {
    icon: MessageSquare,
    title: "Chat Agent",
    groups: [
      {
        name: "Website Chat",
        items: [
          "Real-time chat widget",
          "Knowledge base responses",
          "Lead capture",
          "Appointment booking",
          "Human handoff",
        ],
      },
      {
        name: "Omnichannel",
        items: [
          "Website chat",
          "WhatsApp",
          "SMS",
          "Facebook Messenger",
          "Instagram DM",
        ],
      },
    ],
  },
  {
    icon: BookOpen,
    title: "AI Knowledge Base",
    groups: [
      {
        name: "Train agents using",
        items: ["PDFs", "Documents", "FAQs", "Website URLs", "CSV files", "Manual Q&A entries"],
      },
      {
        name: "Features",
        items: ["Auto-sync knowledge", "Version control", "Source citations", "Confidence scoring"],
      },
    ],
  },
  {
    icon: Send,
    title: "SMS Automation",
    groups: [
      {
        name: "Automated SMS",
        items: [
          "Appointment confirmations",
          "Appointment reminders",
          "Follow-ups",
          "Lead nurturing",
          "Customer re-engagement",
        ],
      },
    ],
  },
  {
    icon: Plug,
    title: "Integrations",
    groups: [
      { name: "CRM", items: ["HubSpot", "Salesforce", "Zoho", "Pipedrive"] },
      { name: "Calendars", items: ["Google Calendar", "Microsoft Outlook"] },
      { name: "Communication", items: ["Twilio", "Telnyx", "WhatsApp Business"] },
    ],
  },
  {
    icon: BarChart3,
    title: "Analytics & Admin",
    groups: [
      {
        name: "Analytics dashboard",
        items: [
          "Calls answered",
          "Average call duration",
          "Conversion rate",
          "Appointments booked",
          "Chat engagement",
          "Customer satisfaction",
          "Agent utilization",
        ],
      },
      {
        name: "Admin controls",
        items: [
          "Agent builder & prompt editor",
          "Voice & personality settings",
          "Business hours & escalation rules",
          "User roles & permissions",
          "Audit logs",
        ],
      },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Everything you need to handle every conversation
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          A complete AI voice and chat platform — from the first ring to the
          follow-up text.
        </p>
      </div>

      <div className="mt-16 space-y-16">
        {sections.map((section) => (
          <section key={section.title}>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <section.icon className="size-5" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">
                {section.title}
              </h2>
            </div>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {section.groups.map((g) => (
                <div
                  key={g.name}
                  className="rounded-xl border border-border bg-card p-6"
                >
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    {g.name}
                  </h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {g.items.map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <span className="size-1.5 rounded-full bg-primary" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

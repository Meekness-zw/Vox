export type Plan = {
  id: "starter" | "growth" | "pro" | "enterprise";
  name: string;
  price: number | null; // null = custom
  priceLabel: string;
  tagline: string;
  highlighted?: boolean;
  cta: string;
  features: string[];
  limits: {
    agents: string;
    voiceMinutes: string;
    chatConversations: string;
  };
};

export const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 99,
    priceLabel: "$99",
    tagline: "Everything a single location needs to never miss a call.",
    cta: "Start free trial",
    limits: {
      agents: "1 voice + 1 chat agent",
      voiceMinutes: "500 voice min / mo",
      chatConversations: "1,000 chats / mo",
    },
    features: [
      "1 AI Voice Agent",
      "1 AI Chat Agent",
      "500 voice minutes/month",
      "1,000 chat conversations/month",
      "SMS follow-ups",
      "Appointment booking",
      "Call summaries",
      "Basic analytics",
      "Email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 299,
    priceLabel: "$299",
    tagline: "For growing teams that need integrations and more volume.",
    highlighted: true,
    cta: "Start free trial",
    limits: {
      agents: "Up to 5 AI agents",
      voiceMinutes: "3,000 voice min / mo",
      chatConversations: "10,000 chats / mo",
    },
    features: [
      "Up to 5 AI Agents",
      "3,000 voice minutes/month",
      "10,000 chat conversations/month",
      "CRM integration",
      "Calendar integration",
      "Multi-language support",
      "Advanced analytics",
      "Team access",
      "Priority support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 799,
    priceLabel: "$799",
    tagline: "For high-volume operations that need automation & API access.",
    cta: "Start free trial",
    limits: {
      agents: "Unlimited AI agents",
      voiceMinutes: "10,000 voice min / mo",
      chatConversations: "Unlimited chats",
    },
    features: [
      "Unlimited AI Agents",
      "10,000 voice minutes/month",
      "Unlimited chat conversations",
      "API access",
      "Webhooks",
      "Custom workflows",
      "Custom branding",
      "Dedicated onboarding",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: null,
    priceLabel: "Custom",
    tagline: "Dedicated infrastructure, security, and support at scale.",
    cta: "Contact sales",
    limits: {
      agents: "Unlimited everything",
      voiceMinutes: "Custom volume",
      chatConversations: "Unlimited",
    },
    features: [
      "Unlimited everything",
      "Dedicated infrastructure",
      "SLA guarantees",
      "Advanced security",
      "SSO",
      "Custom integrations",
      "Dedicated account manager",
    ],
  },
];

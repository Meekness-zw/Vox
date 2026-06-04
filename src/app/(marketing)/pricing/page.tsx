import type { Metadata } from "next";
import { PricingCards } from "@/components/marketing/pricing-cards";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for AI voice and chat agents. Starter $99, Growth $299, Pro $799, and custom Enterprise.",
};

const faqs = [
  {
    q: "What counts as a voice minute?",
    a: "Voice minutes are billed per minute of connected call time handled by your AI voice agents. Unanswered or dropped calls aren't counted.",
  },
  {
    q: "Can I use my own phone number?",
    a: "Yes. Connect an existing number through Twilio or Telnyx, or provision a new one in a couple of clicks.",
  },
  {
    q: "Do all plans include SMS and appointment booking?",
    a: "Yes — SMS follow-ups and appointment booking are included on every plan, including Starter.",
  },
  {
    q: "What happens if I exceed my limits?",
    a: "Your agents keep running. Overage is billed at your plan's per-minute and per-conversation rate, and you can upgrade anytime.",
  },
  {
    q: "Is there a free trial?",
    a: "Every paid plan starts with a free trial — no credit card required to build and test your first agent.",
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Pricing that scales with you
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Voice, chat, SMS, and appointment booking on every plan. Upgrade as
          your volume grows.
        </p>
      </div>

      <div className="mt-14">
        <PricingCards />
      </div>

      <div className="mx-auto mt-20 max-w-3xl">
        <h2 className="text-center text-2xl font-bold tracking-tight">
          Frequently asked questions
        </h2>
        <dl className="mt-8 divide-y divide-border">
          {faqs.map((f) => (
            <div key={f.q} className="py-5">
              <dt className="font-medium">{f.q}</dt>
              <dd className="mt-2 text-sm text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

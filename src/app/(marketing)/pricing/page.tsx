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
    a: "Yes. Port the number to Twilio or forward it to the Twilio number assigned to the bot. Vox can also provision a new Twilio number.",
  },
  {
    q: "Do all plans include SMS and appointment booking?",
    a: "The platform supports dashboard SMS and appointment booking. Access and limits can be configured for each workspace plan.",
  },
  {
    q: "What happens if I exceed my limits?",
    a: "Usage remains visible in the dashboard. Automatic overage charging and hard quota enforcement require Stripe billing to be enabled.",
  },
  {
    q: "Is there a free trial?",
    a: "You can create a free account and test the demo before requesting a customized paid bot.",
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

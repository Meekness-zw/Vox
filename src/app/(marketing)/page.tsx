import Link from "next/link";
import {
  Phone,
  MessageSquare,
  CalendarCheck,
  BookOpen,
  Languages,
  BarChart3,
  ArrowRight,
  PhoneIncoming,
  Sparkles,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PricingCards } from "@/components/marketing/pricing-cards";

const coreFeatures = [
  {
    icon: Phone,
    title: "AI Voice Agents",
    desc: "Answer inbound calls 24/7 with natural, multi-turn conversations, interruption handling, and call routing.",
  },
  {
    icon: MessageSquare,
    title: "AI Chat Agents",
    desc: "A real-time website widget plus WhatsApp, SMS, Messenger & Instagram — all from one knowledge base.",
  },
  {
    icon: Send,
    title: "SMS Follow-Up",
    desc: "Automated confirmations, reminders, follow-ups, and re-engagement that recover missed opportunities.",
  },
  {
    icon: CalendarCheck,
    title: "Appointment Booking",
    desc: "Agents check availability and book straight into Google Calendar or Outlook during the conversation.",
  },
  {
    icon: BookOpen,
    title: "Knowledge Base Training",
    desc: "Train on PDFs, docs, FAQs, URLs and CSVs with auto-sync, versioning, and source citations.",
  },
  {
    icon: BarChart3,
    title: "Conversation Analytics",
    desc: "Track calls answered, conversion rate, appointments booked, CSAT and agent utilization in real time.",
  },
];

const steps = [
  {
    n: "01",
    title: "Train your agent",
    desc: "Upload documents or point us at your website. Vox builds a knowledge base in minutes.",
  },
  {
    n: "02",
    title: "Configure & connect",
    desc: "Pick a voice and personality, set business hours and escalation rules, connect your number and calendar.",
  },
  {
    n: "03",
    title: "Go live 24/7",
    desc: "Your agent answers every call and chat, books appointments, and follows up over SMS automatically.",
  },
];

const integrations = [
  "HubSpot",
  "Salesforce",
  "Zoho",
  "Pipedrive",
  "Google Calendar",
  "Outlook",
  "Twilio",
  "Telnyx",
  "WhatsApp",
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-20 sm:px-6 sm:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mx-auto mb-5 border-0">
              <Sparkles className="size-3.5 text-primary" />
              AI receptionist + chat in one platform
            </Badge>
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl">
              Never miss a call or a message again
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted-foreground">
              Vox gives every business an AI voice agent and chat agent that
              answer 24/7, book appointments, and follow up over SMS — trained
              on your own knowledge base.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup">
                <Button size="lg">
                  Get started free <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link href="/demo">
                <Button size="lg" variant="secondary">
                  Try the live chat demo
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              No credit card required · Launch in minutes
            </p>
          </div>

          {/* Hero visual: a faux call card */}
          <div className="mx-auto mt-16 max-w-2xl">
            <CallPreview />
          </div>
        </div>
      </section>

      {/* Logos / integrations strip */}
      <section className="border-y border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <p className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Works with the tools you already use
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {integrations.map((name) => (
              <span
                key={name}
                className="text-sm font-medium text-muted-foreground"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Core features */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            One platform for every conversation
          </h2>
          <p className="mt-4 text-muted-foreground">
            Voice, chat, SMS and scheduling — unified, on-brand, and always on.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {coreFeatures.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Live in three steps
            </h2>
            <p className="mt-4 text-muted-foreground">
              Most teams launch their first agent the same afternoon.
            </p>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n}>
                <div className="text-sm font-semibold text-primary">{s.n}</div>
                <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Multi-language callout */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid items-center gap-10 rounded-2xl border border-border bg-card p-8 md:grid-cols-2 md:p-12">
          <div>
            <Languages className="size-8 text-primary" />
            <h2 className="mt-4 text-3xl font-bold tracking-tight">
              Speak your customers&apos; language
            </h2>
            <p className="mt-4 text-muted-foreground">
              Agents detect and respond in your customer&apos;s language
              automatically, with sentiment detection and context memory across
              the whole conversation.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
              <li>• Natural, multi-turn conversations with interruption handling</li>
              <li>• Call recording, summaries, action items & transcripts</li>
              <li>• Missed-call recovery and human handoff when it matters</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-background p-6">
            <ChatPreview />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-muted-foreground">
            Start small and scale as you grow. Every plan includes voice, chat
            and SMS.
          </p>
        </div>
        <div className="mt-12">
          <PricingCards />
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-primary px-8 py-14 text-center text-primary-foreground sm:px-16">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Put your front desk on autopilot
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-balance text-primary-foreground/80">
            Launch an AI voice and chat agent for your business today. No credit
            card required.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/signup">
              <Button size="lg" variant="secondary">
                Get started free <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function CallPreview() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xl">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <PhoneIncoming className="size-5" />
          </div>
          <div>
            <div className="text-sm font-medium">Incoming call</div>
            <div className="text-xs text-muted-foreground">+1 (415) 555-0142</div>
          </div>
        </div>
        <Badge variant="success" className="rounded-sm">
          Answered by Micheal
        </Badge>
      </div>
      <div className="space-y-3 py-4">
        <Bubble who="agent">
          Thanks for calling Bright Smile Dental, this is Micheal. How can I help?
        </Bubble>
        <Bubble who="caller">Hi, I&apos;d like to book a cleaning this week.</Bubble>
        <Bubble who="agent">
          I have Thursday at 10am open — shall I book that for you?
        </Bubble>
      </div>
      <div className="flex items-center justify-between border-t border-border pt-4">
        <div className="flex items-end gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="block w-1 origin-bottom rounded-full bg-primary"
              style={{
                height: 20,
                animation: `vox-pulse 1s ease-in-out ${i * 0.12}s infinite`,
              }}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          Booking · Google Calendar
        </span>
      </div>
    </div>
  );
}

function ChatPreview() {
  return (
    <div className="space-y-3">
      <Bubble who="caller">¿Cuánto cuesta una limpieza dental?</Bubble>
      <Bubble who="agent">
        Una limpieza cuesta $120 y dura unos 45 minutos. ¿Quiere que reserve una
        cita? 🦷
      </Bubble>
      <Bubble who="caller">Sí, mañana por la tarde.</Bubble>
      <Bubble who="agent">
        Perfecto, tengo mañana a las 3:00 pm disponible. ✅
      </Bubble>
    </div>
  );
}

function Bubble({
  who,
  children,
}: {
  who: "agent" | "caller";
  children: React.ReactNode;
}) {
  const isAgent = who === "agent";
  return (
    <div className={isAgent ? "flex justify-start" : "flex justify-end"}>
      <div
        className={
          isAgent
            ? "max-w-[80%] rounded-2xl rounded-tl-sm bg-muted px-4 py-2 text-sm"
            : "max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground"
        }
      >
        {children}
      </div>
    </div>
  );
}

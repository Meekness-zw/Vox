import type { Metadata } from "next";
import { Check } from "lucide-react";
import { ChatPanel } from "@/components/chat/chat-panel";

export const metadata: Metadata = {
  title: "Live demo",
  description:
    "Try a live Vox AI chat agent trained on a sample dental practice knowledge base.",
};

const points = [
  "Trained on a sample 'Bright Smile Dental' knowledge base",
  "Answers about services, pricing, hours & insurance",
  "Captures leads and walks through booking",
  "Streams responses in real time",
];

export default function DemoPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Talk to a live AI agent
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            This is a real, working chat agent — the same engine that powers
            website chat, WhatsApp, and SMS inside Vox. Ask it anything a
            customer might.
          </p>
          <ul className="mt-6 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                {p}
              </li>
            ))}
          </ul>
          <p className="mt-6 rounded-lg border border-border bg-muted/50 p-4 text-xs text-muted-foreground">
            Tip: set <code className="font-mono">AI_GATEWAY_API_KEY</code> in
            your environment to route this demo through a real model via the
            Vercel AI Gateway. With no key set, it runs a built-in knowledge-base
            responder so the demo still works offline.
          </p>
        </div>

        <ChatPanel agentName="Bright Smile Concierge" agentId="ag_web_chat" />
      </div>
    </div>
  );
}

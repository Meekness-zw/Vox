import type { Metadata } from "next";
import { Check, Mic } from "lucide-react";
import { DemoExperience } from "@/components/chat/demo-experience";

export const metadata: Metadata = {
  title: "Live demo",
  description:
    "Talk to a live Vox AI voice agent in your browser, or chat with it — trained on a sample dental practice knowledge base.",
};

const points = [
  "Speak to it out loud — it listens and replies with its voice",
  "Trained on a sample 'Bright Smile Dental' knowledge base",
  "Answers about services, pricing, hours & insurance",
  "Captures leads and walks through booking",
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
            Hit <strong>Start voice call</strong> and just talk — the same engine
            that powers Vox phone, website chat, WhatsApp, and SMS. Ask it
            anything a customer might.
          </p>
          <ul className="mt-6 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                {p}
              </li>
            ))}
          </ul>
          <p className="mt-6 flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-4 text-xs text-muted-foreground">
            <Mic className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Voice runs in your browser (Chrome, Edge, or Safari) and asks for
              mic permission the first time. Prefer typing? Switch to the{" "}
              <strong>Chat</strong> tab — it works everywhere.
            </span>
          </p>
        </div>

        <DemoExperience />
      </div>
    </div>
  );
}

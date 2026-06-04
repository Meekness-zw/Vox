"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Send } from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

function textOf(message: UIMessage) {
  return message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");
}

const suggestions = [
  "What are your hours?",
  "How much is a cleaning?",
  "Do you take Delta Dental?",
  "I'd like to book an appointment",
];

export function ChatPanel({
  agentId = "ag_web_chat",
  agentName = "Vox Concierge",
  className,
}: {
  agentId?: string;
  agentName?: string;
  className?: string;
}) {
  const [input, setInput] = useState("");
  const [conversationId] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now())
  );
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { agentId, conversationId },
    }),
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, status]);

  const busy = status === "submitted" || status === "streaming";

  function submit(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    sendMessage({ text: value });
    setInput("");
  }

  return (
    <div
      className={cn(
        "flex h-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Logo showText={false} href="#" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{agentName}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" />
            Online · replies instantly
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-4">
            <Bubble role="assistant">
              Hi! 👋 I&apos;m {agentName}. Ask me about services, pricing or
              hours — or book an appointment.
            </Bubble>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <Bubble key={m.id} role={m.role === "user" ? "user" : "assistant"}>
            {textOf(m) || (busy ? "…" : "")}
          </Bubble>
        ))}

        {busy && messages[messages.length - 1]?.role === "user" && (
          <Bubble role="assistant">
            <Typing />
          </Bubble>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message…"
          className="h-10 flex-1 rounded-full border border-input bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}

function Bubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={cn(
          "max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm",
          isUser
            ? "rounded-tr-sm bg-primary text-primary-foreground"
            : "rounded-tl-sm bg-muted text-foreground"
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <span className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-muted-foreground/60"
          style={{ animation: `vox-pulse 1s ease-in-out ${i * 0.15}s infinite` }}
        />
      ))}
    </span>
  );
}

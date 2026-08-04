"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  authorType?: "customer" | "bot" | "human";
  authorName?: string;
  sequence?: number;
};

type InboxStatus = "ai_active" | "needs_human" | "human_active" | "resolved";

function mergeMessages(current: Msg[], incoming: Msg[]) {
  const seen = new Set(current.map((message) => message.id));
  return [...current, ...incoming.filter((message) => !seen.has(message.id))];
}

export function WidgetClient({ token, title, welcome, color, embedProof }: {
  token: string; title: string; welcome: string; color: string; embedProof: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    { id: "welcome", role: "assistant", content: welcome, authorType: "bot" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [inboxStatus, setInboxStatus] = useState<InboxStatus>("ai_active");
  const [conversationId] = useState(() => crypto.randomUUID());
  const cursorRef = useRef(0);
  // Issued by the first reply and required by every later send and poll. A ref
  // keeps the polling effect from restarting each time the token comes back.
  const threadTokenRef = useRef("");
  const shouldPoll = inboxStatus === "needs_human" || inboxStatus === "human_active";

  useEffect(() => {
    if (!shouldPoll) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const params = new URLSearchParams({
          token,
          embedProof,
          conversationId,
          threadToken: threadTokenRef.current,
          after: String(cursorRef.current),
        });
        const response = await fetch(`/api/widget/chat?${params}`, {
          cache: "no-store",
        });
        if (response.ok) {
          const data = await response.json() as {
            inboxStatus?: InboxStatus;
            cursor?: number;
            messages?: Msg[];
          };
          if (!cancelled) {
            if (typeof data.cursor === "number") cursorRef.current = data.cursor;
            if (Array.isArray(data.messages) && data.messages.length) {
              setMessages((current) => mergeMessages(current, data.messages!));
            }
            if (data.inboxStatus) setInboxStatus(data.inboxStatus);
          }
        }
      } finally {
        if (!cancelled) timeout = setTimeout(poll, 2_500);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [conversationId, embedProof, shouldPoll, token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || inboxStatus === "resolved") return;
    const messageId = crypto.randomUUID();
    const customerMessage: Msg = {
      id: messageId,
      role: "user",
      content: text,
      authorType: "customer",
    };
    const next = [...messages, customerMessage];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/widget/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          embedProof,
          conversationId,
          threadToken: threadTokenRef.current,
          messageId,
          messages: next.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await response.json() as {
        error?: string;
        inboxStatus?: InboxStatus;
        replyMessage?: Msg;
        threadToken?: string;
      };
      if (!response.ok) throw new Error(data.error || "Message could not be sent.");
      if (data.threadToken) threadTokenRef.current = data.threadToken;
      if (data.replyMessage) {
        if (typeof data.replyMessage.sequence === "number") {
          cursorRef.current = Math.max(cursorRef.current, data.replyMessage.sequence);
        }
        setMessages((current) => mergeMessages(current, [data.replyMessage!]));
      }
      if (data.inboxStatus) setInboxStatus(data.inboxStatus);
    } catch (error) {
      setMessages((current) => mergeMessages(current, [{
        id: `error_${messageId}`,
        role: "assistant",
        content: error instanceof Error ? error.message : "Message could not be sent.",
        authorType: "bot",
      }]));
    } finally {
      setBusy(false);
    }
  }

  const presence = inboxStatus === "needs_human"
    ? "Waiting for a team member"
    : inboxStatus === "human_active"
      ? "Team member joined"
      : inboxStatus === "resolved"
        ? "Conversation resolved"
        : "AI assistant online";

  return <div className="flex h-screen flex-col bg-background text-foreground">
    <header className="px-4 py-3 text-white" style={{ background: color }}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-0.5 text-xs text-white/80">{presence}</div>
    </header>
    <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
      {messages.map((message) => <div key={message.id}>
        {message.authorType === "human" && message.authorName &&
          <div className="mb-1 text-xs text-muted-foreground">{message.authorName}</div>}
        <div
          className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
            message.role === "user" ? "ml-auto text-white" : "bg-muted"
          }`}
          style={message.role === "user" ? { background: color } : undefined}
        >
          {message.content}
        </div>
      </div>)}
      {busy && inboxStatus === "ai_active" &&
        <div className="text-xs text-muted-foreground">Typing…</div>}
    </div>
    <form onSubmit={submit} className="flex gap-2 border-t p-3">
      <input
        className="min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none disabled:opacity-60"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={inboxStatus === "resolved" ? "This conversation is resolved" : "Type your message…"}
        maxLength={4_000}
        disabled={inboxStatus === "resolved"}
      />
      <button
        className="rounded-lg px-4 py-2 text-sm text-white disabled:opacity-50"
        style={{ background: color }}
        disabled={busy || inboxStatus === "resolved" || !input.trim()}
      >
        Send
      </button>
    </form>
  </div>;
}

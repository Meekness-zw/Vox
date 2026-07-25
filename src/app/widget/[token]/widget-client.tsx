"use client";

import { FormEvent, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export function WidgetClient({ token, title, welcome, color }: {
  token: string; title: string; welcome: string; color: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: welcome }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId] = useState(() => crypto.randomUUID());
  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next); setInput(""); setBusy(true);
    try {
      const res = await fetch("/api/widget/chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, conversationId, messages: next }),
      });
      const data = await res.json();
      setMessages([...next, { role: "assistant", content: data.reply || "Please try again." }]);
    } finally { setBusy(false); }
  }
  return <div className="flex h-screen flex-col bg-background text-foreground">
    <header className="px-4 py-3 text-sm font-semibold text-white" style={{ background: color }}>{title}</header>
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      {messages.map((m, i) => <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto text-white" : "bg-muted"}`} style={m.role === "user" ? { background: color } : undefined}>{m.content}</div>)}
      {busy && <div className="text-xs text-muted-foreground">Typing…</div>}
    </div>
    <form onSubmit={submit} className="flex gap-2 border-t p-3">
      <input className="min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your message…" />
      <button className="rounded-lg px-4 py-2 text-sm text-white" style={{ background: color }}>Send</button>
    </form>
  </div>;
}

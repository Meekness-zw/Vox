"use client";

import { useEffect, useState, useTransition } from "react";
import { Save, Phone, MessageSquare, Sparkles, Loader2 } from "lucide-react";
import type { Agent } from "@/lib/types";
import { saveAgent } from "@/app/(dashboard)/dashboard/agents/actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChatPanel } from "@/components/chat/chat-panel";

const voices = [
  "Micheal — calm, professional",
  "Leo — calm, low",
  "Maya — bright, energetic",
  "Sam — neutral, clear",
];

type VoiceOption = { id: string; name: string; accent?: string; description?: string };

const languages = [
  "English (US)",
  "English (UK)",
  "Spanish",
  "French",
  "German",
  "Shona",
  "English + Shona (code-switching)",
  "Multi-language",
];

export function AgentBuilder({ agent, isNew, workspaceId }: { agent: Agent; isNew: boolean; workspaceId?: string }) {
  const [form, setForm] = useState<Agent>(agent);
  const [saved, setSaved] = useState<null | { persisted: boolean }>(null);
  const [pending, startTransition] = useTransition();
  const [elevenVoices, setElevenVoices] = useState<VoiceOption[]>([]);

  useEffect(() => {
    fetch("/api/elevenlabs/voices")
      .then((response) => response.ok ? response.json() : { voices: [] })
      .then((data: { voices?: VoiceOption[] }) => setElevenVoices(data.voices ?? []))
      .catch(() => setElevenVoices([]));
  }, []);

  function update<K extends keyof Agent>(key: K, value: Agent[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(null);
  }

  function handleSave() {
    const payload: Agent = isNew
      ? { ...form, id: `ag_${Date.now()}`, createdAt: new Date().toISOString() }
      : form;
    startTransition(async () => {
      const res = await saveAgent(payload, workspaceId);
      setSaved({ persisted: res.persisted });
    });
  }

  const Icon = form.type === "voice" ? Phone : MessageSquare;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      {/* Editor */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Agent name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="e.g. Front Desk Receptionist"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Channel</Label>
              <div className="flex gap-2">
                {(["voice", "chat"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => update("type", t)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                      form.type === t
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t === "voice" ? (
                      <Phone className="size-4" />
                    ) : (
                      <MessageSquare className="size-4" />
                    )}
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="lang">Language</Label>
                <select
                  id="lang"
                  value={form.language}
                  onChange={(e) => update("language", e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {languages.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </div>
              {form.type === "voice" && (
                <div className="space-y-1.5">
                  <Label htmlFor="voice">Voice</Label>
                  <select
                    id="voice"
                    value={form.voice ?? voices[0]}
                    onChange={(e) => update("voice", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {elevenVoices.length > 0 && (
                      <optgroup label="ElevenLabs voices">
                        {elevenVoices.map((v) => (
                          <option key={v.id} value={`elevenlabs:${v.id}`}>
                            {v.name}{v.accent ? ` — ${v.accent}` : ""}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label={elevenVoices.length ? "Fallback labels" : "Voices"}>
                    {voices.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                    </optgroup>
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="personality">Personality</Label>
              <Input
                id="personality"
                value={form.personality}
                onChange={(e) => update("personality", e.target.value)}
                placeholder="Friendly, concise, reassuring"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Behavior</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="greeting">Greeting</Label>
              <Textarea
                id="greeting"
                value={form.greeting}
                onChange={(e) => update("greeting", e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="prompt">System prompt</Label>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Sparkles className="size-3" /> Drives the agent&apos;s reasoning
                </span>
              </div>
              <Textarea
                id="prompt"
                value={form.systemPrompt}
                onChange={(e) => update("systemPrompt", e.target.value)}
                rows={5}
                className="font-mono text-xs"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="hours">Business hours</Label>
                <Input
                  id="hours"
                  value={form.businessHours}
                  onChange={(e) => update("businessHours", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="esc">Escalation rule</Label>
                <Input
                  id="esc"
                  value={form.escalation}
                  onChange={(e) => update("escalation", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={!form.name.trim() || pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {isNew ? "Create agent" : "Save changes"}
          </Button>
          {saved && (
            <span className="text-sm text-success">
              {saved.persisted
                ? "Saved to database · changes are live"
                : "Saved (demo mode — set DATABASE_URL to persist)"}
            </span>
          )}
        </div>
      </div>

      {/* Live test */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge>
            <Icon className="size-3" /> Live preview
          </Badge>
          <span className="text-sm text-muted-foreground">
            Test {form.name || "your agent"} in real time
          </span>
        </div>
        <ChatPanel
          agentId={form.id}
          agentName={form.name || "Untitled agent"}
        />
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { MessageSquare, Mic } from "lucide-react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { VoiceAgent } from "@/components/chat/voice-agent";
import { cn } from "@/lib/utils";

export function DemoExperience() {
  const [mode, setMode] = useState<"voice" | "chat">("voice");

  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg border border-border bg-card p-1">
        <Tab active={mode === "voice"} onClick={() => setMode("voice")} icon={Mic}>
          Talk (voice)
        </Tab>
        <Tab active={mode === "chat"} onClick={() => setMode("chat")} icon={MessageSquare}>
          Chat
        </Tab>
      </div>

      {mode === "voice" ? (
        <VoiceAgent
          agentId="ag_front_desk"
          agentName="Micheal"
          agentVoice="demo"
          greeting="Thanks for calling Bright Smile Dental, this is Micheal. How can I help you today?"
        />
      ) : (
        <ChatPanel agentName="Bright Smile Concierge" agentId="ag_web_chat" />
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Mic;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-4" />
      {children}
    </button>
  );
}

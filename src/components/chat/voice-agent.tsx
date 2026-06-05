"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Volume2, Loader2, AlertCircle, Repeat } from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

/* ---- Minimal Web Speech API typings -------------------------------------- */
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type Turn = { role: "user" | "agent"; text: string };
type Status = "idle" | "listening" | "thinking" | "speaking";

export function VoiceAgent({
  agentId = "ag_front_desk",
  agentName = "Ava",
  greeting = "Thanks for calling Bright Smile Dental, this is Ava. How can I help you today?",
}: {
  agentId?: string;
  agentName?: string;
  greeting?: string;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [handsFree, setHandsFree] = useState(true);
  const [active, setActive] = useState(false); // call in progress

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  const handsFreeRef = useRef(handsFree);
  const activeRef = useRef(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  turnsRef.current = turns;
  handsFreeRef.current = handsFree;

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) &&
      "speechSynthesis" in window;
    setSupported(ok);
    if (ok) pickVoice();
    return () => {
      try {
        recognitionRef.current?.abort();
        window.speechSynthesis?.cancel();
        audioRef.current?.pause();
      } catch {}
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, interim, status]);

  function pickVoice() {
    const load = () => {
      const voices = window.speechSynthesis.getVoices();
      // Rank the available voices so we use the most natural one the device has
      // (e.g. macOS "Enhanced"/"Premium", Chrome "Google", Edge "Natural"
      // voices) instead of the robotic default.
      const score = (v: SpeechSynthesisVoice) => {
        const n = v.name.toLowerCase();
        let s = 0;
        if (/natural|neural/.test(n)) s += 120;
        if (/enhanced|premium/.test(n)) s += 90;
        if (/online|\(online\)/.test(n)) s += 50;
        if (/google/.test(n)) s += 60;
        if (/\b(ava|samantha|allison|serena|zoe|jenny|aria|sonia|emma|nora|libby)\b/.test(n))
          s += 40;
        if (v.lang === "en-US") s += 25;
        else if (v.lang.startsWith("en")) s += 12;
        // Penalise the novelty / low-quality macOS voices.
        if (/albert|bad news|bahh|bells|boing|bubbles|cellos|fred|jester|organ|trinoids|whisper|wobble|zarvox|junior|ralph|kathy|good news/.test(n))
          s -= 200;
        if (v.localService === false) s += 10; // network voices tend to be richer
        return s;
      };
      const best = voices
        .filter((v) => v.lang.startsWith("en"))
        .sort((a, b) => score(b) - score(a))[0];
      voiceRef.current = best ?? voices[0] ?? null;
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
  }

  const browserSpeak = useCallback((text: string, onDone: () => void) => {
    try {
      window.speechSynthesis.cancel();
      // Speak sentence-by-sentence so intonation resets naturally and there are
      // small human pauses between phrases — much more fluent than one flat run
      // (also dodges Chrome's long-utterance cutoff bug).
      const sentences =
        text.match(/[^.!?\n]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [
          text,
        ];
      setStatus("speaking");
      let i = 0;
      const speakNext = () => {
        if (i >= sentences.length) {
          onDone();
          return;
        }
        const u = new SpeechSynthesisUtterance(sentences[i++]);
        if (voiceRef.current) u.voice = voiceRef.current;
        u.rate = 0.97; // a touch slower reads as calmer / more natural
        u.pitch = 1.0;
        u.onend = speakNext;
        u.onerror = () => onDone();
        window.speechSynthesis.speak(u);
      };
      speakNext();
    } catch {
      onDone();
    }
  }, []);

  /** Speak via neural TTS (human voice) when available; else browser voice. */
  const speak = useCallback(
    async (text: string, onDone: () => void) => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const ct = res.headers.get("content-type") ?? "";
        if (res.ok && ct.includes("audio")) {
          const url = URL.createObjectURL(await res.blob());
          const audio = new Audio(url);
          audioRef.current = audio;
          setStatus("speaking");
          const finish = () => {
            URL.revokeObjectURL(url);
            if (audioRef.current === audio) audioRef.current = null;
            onDone();
          };
          audio.onended = finish;
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            browserSpeak(text, onDone);
          };
          await audio.play();
          return;
        }
      } catch {
        /* fall through to browser voice */
      }
      browserSpeak(text, onDone);
    },
    [browserSpeak]
  );

  const stopSpeaking = useCallback(() => {
    try {
      window.speechSynthesis.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    } catch {}
  }, []);

  const startListening = useCallback(() => {
    const Ctor: SpeechRecognitionCtor | undefined =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor })
        .webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    recognitionRef.current = rec;

    let finalText = "";
    setInterim("");
    setStatus("listening");

    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone access was blocked. Allow mic access and try again.");
        endCall();
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setError("Voice error: " + e.error);
      }
    };
    rec.onend = () => {
      setInterim("");
      const text = finalText.trim();
      if (text) {
        void handleUserSpeech(text);
      } else if (activeRef.current && handsFreeRef.current) {
        // Heard nothing; keep listening so the user can take their time.
        startListening();
      } else if (activeRef.current) {
        setStatus("idle");
      }
    };

    try {
      rec.start();
    } catch {
      /* already started */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUserSpeech = useCallback(
    async (text: string) => {
      const userTurn: Turn = { role: "user", text };
      const next = [...turnsRef.current, userTurn];
      setTurns(next);
      setStatus("thinking");

      try {
        const res = await fetch("/api/voice-demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId,
            messages: next.map((t) => ({
              role: t.role === "user" ? "user" : "assistant",
              content: t.text,
            })),
          }),
        });
        const data = await res.json();
        const reply: string = data.reply ?? "Sorry, I didn't catch that.";
        setTurns((t) => [...t, { role: "agent", text: reply }]);
        speak(reply, () => {
          if (activeRef.current && handsFreeRef.current) startListening();
          else setStatus("idle");
        });
      } catch {
        setError("Couldn't reach the agent. Please try again.");
        setStatus("idle");
      }
    },
    [agentId, speak, startListening]
  );

  const startCall = useCallback(() => {
    setError(null);
    setTurns([]);
    setActive(true);
    activeRef.current = true;
    // Speak the greeting, then start listening.
    setTurns([{ role: "agent", text: greeting }]);
    speak(greeting, () => {
      if (activeRef.current) startListening();
    });
  }, [greeting, speak, startListening]);

  const endCall = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    setStatus("idle");
    setInterim("");
    try {
      recognitionRef.current?.abort();
      window.speechSynthesis.cancel();
      audioRef.current?.pause();
      audioRef.current = null;
    } catch {}
  }, []);

  /* ---- render ------------------------------------------------------------- */

  if (supported === false) {
    return (
      <div className="flex h-[560px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
        <AlertCircle className="size-8 text-warning" />
        <p className="font-medium">Voice isn&apos;t supported in this browser</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Try Chrome, Edge, or Safari for the talk-to-the-agent demo — or use the
          Chat tab, which works everywhere.
        </p>
      </div>
    );
  }

  const statusLabel: Record<Status, string> = {
    idle: active ? "Tap the mic to talk" : "Ready to call",
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: `${agentName} is speaking…`,
  };

  return (
    <div className="flex h-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Logo showText={false} href="#" />
          <div>
            <div className="text-sm font-semibold">{agentName}</div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  active ? "bg-success" : "bg-muted-foreground/40"
                )}
              />
              {active ? "On a call" : "AI voice agent"}
            </div>
          </div>
        </div>
        <button
          onClick={() => setHandsFree((h) => !h)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            handsFree
              ? "border-primary bg-accent text-accent-foreground"
              : "border-border text-muted-foreground hover:bg-muted"
          )}
          title="When on, the agent keeps listening after it replies"
        >
          <Repeat className="size-3" /> Hands-free
        </button>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {turns.length === 0 && !active && (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <p className="max-w-xs">
              Start a call and just talk — ask about hours, pricing, insurance,
              or book an appointment. {agentName} answers out loud.
            </p>
          </div>
        )}
        {turns.map((t, i) => (
          <Bubble key={i} role={t.role}>
            {t.text}
          </Bubble>
        ))}
        {interim && (
          <Bubble role="user" muted>
            {interim}
          </Bubble>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-2 border-t border-border p-4">
        {error && (
          <p className="flex items-center gap-1.5 text-xs text-danger">
            <AlertCircle className="size-3.5" /> {error}
          </p>
        )}
        <div className="text-xs text-muted-foreground">{statusLabel[status]}</div>

        {!active ? (
          <button
            onClick={startCall}
            className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Mic className="size-4" /> Start voice call
          </button>
        ) : (
          <div className="flex items-center gap-4">
            <MicOrb
              status={status}
              onClick={() => {
                if (status === "speaking") {
                  stopSpeaking();
                  startListening();
                } else if (status === "idle") {
                  startListening();
                } else if (status === "listening") {
                  recognitionRef.current?.stop();
                }
              }}
            />
            <button
              onClick={endCall}
              className="flex size-11 items-center justify-center rounded-full border border-border text-danger transition-colors hover:bg-danger/10"
              title="End call"
            >
              <Square className="size-4 fill-current" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MicOrb({ status, onClick }: { status: Status; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground"
      title={status === "listening" ? "Stop" : "Talk"}
    >
      {status === "listening" && (
        <>
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/40" />
          <span className="absolute -inset-2 animate-pulse rounded-full bg-primary/10" />
        </>
      )}
      {status === "thinking" ? (
        <Loader2 className="size-5 animate-spin" />
      ) : status === "speaking" ? (
        <Volume2 className="size-5" />
      ) : (
        <Mic className="size-5" />
      )}
    </button>
  );
}

function Bubble({
  role,
  muted,
  children,
}: {
  role: "user" | "agent";
  muted?: boolean;
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={cn(
          "max-w-[82%] rounded-2xl px-4 py-2 text-sm",
          isUser
            ? "rounded-tr-sm bg-primary text-primary-foreground"
            : "rounded-tl-sm bg-muted text-foreground",
          muted && "opacity-60"
        )}
      >
        {children}
      </div>
    </div>
  );
}

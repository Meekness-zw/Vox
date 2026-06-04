import type { SimpleMessage } from "@/lib/agent-runtime";

/** Escape text for safe inclusion in TwiML/XML. */
export function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const VOICE = process.env.VOX_TTS_VOICE ?? "Polly.Joanna-Neural";

export function twimlResponse(inner: string) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Response>${inner}</Response>`,
    { headers: { "Content-Type": "text/xml" } }
  );
}

/** Speak `text`, then listen for the caller's speech and post it to `action`. */
export function sayAndGather(text: string, action: string) {
  return twimlResponse(
    `<Gather input="speech" action="${escapeXml(action)}" method="POST" speechTimeout="auto" language="en-US">` +
      `<Say voice="${VOICE}">${escapeXml(text)}</Say>` +
      `</Gather>` +
      `<Say voice="${VOICE}">Sorry, I didn't catch that. Please call back anytime. Goodbye.</Say>` +
      `<Hangup/>`
  );
}

/** Speak a final message and end the call. */
export function sayAndHangup(text: string) {
  return twimlResponse(`<Say voice="${VOICE}">${escapeXml(text)}</Say><Hangup/>`);
}

/** Heuristic: did the agent (or caller) signal the call is over? */
export function isClosing(text: string) {
  return /\b(goodbye|good day|take care|have a great day|bye)\b/i.test(text);
}

// ---------------------------------------------------------------------------
// In-memory call sessions. Good enough for a single-instance demo; production
// should use Redis or the database keyed by CallSid (see README).
// ---------------------------------------------------------------------------
type CallSession = {
  agentId: string;
  messages: SimpleMessage[];
  from: string;
  startedAt: string;
};

const sessions = new Map<string, CallSession>();

export function getSession(callSid: string) {
  return sessions.get(callSid);
}

export function startSession(callSid: string, agentId: string, from: string) {
  const session: CallSession = {
    agentId,
    messages: [],
    from,
    startedAt: new Date().toISOString(),
  };
  sessions.set(callSid, session);
  return session;
}

export function endSession(callSid: string) {
  const s = sessions.get(callSid);
  sessions.delete(callSid);
  return s;
}

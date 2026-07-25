import type { SimpleMessage } from "@/lib/agent-runtime";
import { sql } from "@/lib/db";

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

/**
 * Speech-recognition locale for a given agent language. This only affects
 * what the caller is heard to say — replies are still always spoken in the
 * fixed English `VOICE` above, since no evaluated TTS vendor (Twilio/Polly,
 * Google Cloud TTS, ElevenLabs) has a Shona voice yet. Google's STT V2 lists
 * sn-ZW under its Chirp/Chirp2 models, but Twilio's own docs don't explicitly
 * confirm passthrough for this locale/speechModel combination — this is an
 * unverified spike, not confirmed-working. Test on a real call before relying
 * on it; Twilio should ignore/reject gracefully back to default if unsupported.
 */
function gatherLocale(agentLanguage: string): { language: string; speechModel?: string } {
  if (/shona/i.test(agentLanguage)) {
    return { language: "sn-ZW", speechModel: "googlev2_telephony" };
  }
  return { language: "en-US" };
}

/** Speak `text`, then listen for the caller's speech and post it to `action`. */
export function sayAndGather(text: string, action: string, agentLanguage = "English (US)") {
  const { language, speechModel } = gatherLocale(agentLanguage);
  return twimlResponse(
    `<Gather input="speech" action="${escapeXml(action)}" method="POST" speechTimeout="auto" language="${language}"${
      speechModel ? ` speechModel="${speechModel}"` : ""
    }>` +
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

export function connectMediaStream(url: string, parameters: Record<string, string>) {
  const params = Object.entries(parameters)
    .map(([name, value]) => `<Parameter name="${escapeXml(name)}" value="${escapeXml(value)}"/>`)
    .join("");
  return twimlResponse(
    `<Connect><Stream url="${escapeXml(url)}">${params}</Stream></Connect>`
  );
}

/** Reply to an inbound WhatsApp/SMS message synchronously (no REST call needed). */
export function messageReply(text: string) {
  return twimlResponse(`<Message>${escapeXml(text)}</Message>`);
}

/** Heuristic: did the agent (or caller) signal the call is over? */
export function isClosing(text: string) {
  return /\b(goodbye|good day|take care|have a great day|bye)\b/i.test(text);
}

// ---------------------------------------------------------------------------
// Database-backed call sessions survive Vercel cold starts and instance changes.
// ---------------------------------------------------------------------------
type CallSession = {
  agentId: string;
  workspaceId: string;
  messages: SimpleMessage[];
  from: string;
  startedAt: string;
};

const sessions = new Map<string, CallSession>();

export async function getSession(callSid: string) {
  const local = sessions.get(callSid);
  if (local) return local;
  if (!sql) return undefined;
  const rows = await sql`select * from voice_call_sessions where call_sid=${callSid} limit 1`;
  if (!rows.length) return undefined;
  const r = rows[0];
  const session: CallSession = {
    agentId: String(r.agent_id), workspaceId: String(r.workspace_id),
    messages: r.messages as SimpleMessage[], from: String(r.caller),
    startedAt: new Date(r.started_at as Date).toISOString(),
  };
  sessions.set(callSid, session);
  return session;
}

export async function startSession(
  callSid: string,
  agentId: string,
  from: string,
  workspaceId = "ws_demo"
) {
  const session: CallSession = {
    agentId,
    workspaceId,
    messages: [],
    from,
    startedAt: new Date().toISOString(),
  };
  sessions.set(callSid, session);
  if (sql) await sql`
    insert into voice_call_sessions(call_sid,workspace_id,agent_id,caller,messages,started_at)
    values(${callSid},${workspaceId},${agentId},${from},${sql.json([])},${session.startedAt})
    on conflict(call_sid) do update set updated_at=now()
  `;
  return session;
}

export async function saveSession(callSid: string, session: CallSession) {
  sessions.set(callSid, session);
  if (sql) await sql`
    update voice_call_sessions set messages=${sql.json(session.messages)},updated_at=now()
    where call_sid=${callSid}
  `;
}

export async function endSession(callSid: string) {
  const s = await getSession(callSid);
  sessions.delete(callSid);
  if (sql) await sql`delete from voice_call_sessions where call_sid=${callSid}`;
  return s;
}

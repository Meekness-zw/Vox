import { generateReply, type SimpleMessage } from "@/lib/agent-runtime";
import { buildConversation } from "@/lib/conversation";
import { retrieveContext } from "@/lib/rag";
import { addAuditEvent, getAgentById, getCompanyProfile, upsertConversation } from "@/lib/repository";

export const maxDuration = 30;

export async function POST(req: Request) {
  const expected = process.env.VOX_BOT_SERVICE_TOKEN;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const workspaceId = String(body.workspaceId ?? "");
  const agentId = String(body.agentId ?? "");
  const callSid = String(body.callSid ?? "");
  const messages = (Array.isArray(body.messages) ? body.messages : []) as SimpleMessage[];
  const agent = await getAgentById(agentId, workspaceId);
  if (!agent || !callSid) return Response.json({ error: "Agent unavailable" }, { status: 404 });
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const previousAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "";
  const confirmed = /^(yes|yeah|yep|please|sure|okay|ok|hongu|ehe|ndibatanidzei|connect me)[.! ]*$/i.test(last.trim());
  const offered = /(connect|transfer|human|team member|person|ndikubatanidze|munhu)/i.test(previousAssistant);
  if (confirmed && offered) {
    const profile = await getCompanyProfile(workspaceId);
    if (profile?.transferPhone) {
      const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
      if (sid && token) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://vox-rust-six.vercel.app";
        const callback = `${appUrl}/api/voice/transfer-status?workspaceId=${encodeURIComponent(workspaceId)}&callSid=${encodeURIComponent(callSid)}`;
        const xml = `<Response><Say>Please hold while I connect you.</Say><Dial action="${callback.replaceAll("&", "&amp;")}" method="POST">${profile.transferPhone}</Dial></Response>`;
        const transfer = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}.json`, {
          method: "POST",
          headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ Twiml: xml }),
        });
        if (transfer.ok) {
          await addAuditEvent(workspaceId, "voice-bot", "call.transfer_started", { callSid, transferPhone: profile.transferPhone });
          return Response.json({ reply: "Certainly. Please hold while I connect you to a team member.", transferring: true });
        }
      }
    }
  }
  const context = await retrieveContext(workspaceId, last);
  const languageMode = String(body.languageMode ?? "auto").toLowerCase();
  const callAgent = languageMode === "shona"
    ? { ...agent, language: "CALL_LANGUAGE: Shona. Reply only in natural Shona unless the caller explicitly asks to switch to English." }
    : languageMode === "english"
      ? { ...agent, language: "CALL_LANGUAGE: English. Reply only in English unless the caller explicitly asks to switch to Shona." }
      : agent;
  const reply = await generateReply(callAgent, messages, context?.text, {
    workspaceId, agentId, channel: "voice",
    conversationId: `cv_${callSid}`, contactPhone: String(body.caller ?? ""),
  });
  const complete = [...messages, { role: "assistant" as const, content: reply }];
  await upsertConversation(buildConversation({
    id: `cv_${callSid}`, agentId, channel: "voice",
    contact: String(body.caller ?? "unknown"),
    startedAt: String(body.startedAt ?? new Date().toISOString()),
    durationSec: Math.max(0, Math.round((Date.now() - new Date(body.startedAt ?? Date.now()).getTime()) / 1000)),
    messages: complete,
  }), workspaceId);
  return Response.json({ reply });
}

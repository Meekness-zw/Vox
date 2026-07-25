import { isDbEnabled, initSchema, sql } from "@/lib/db";
import { upsertAgent, insertConversation, upsertPhoneNumber } from "@/lib/repository";
import { agents, conversations } from "@/lib/data";
import { hashPassword } from "@/lib/auth/password";
import { ingestSource } from "@/lib/rag";
import { demoKnowledgeBase } from "@/lib/agent-runtime";
import { getSession } from "@/lib/auth/session-cookies";
import { isVoxAdmin } from "@/lib/admin";

/**
 * One-shot initializer: creates the schema and seeds it with the demo data.
 *
 *   curl -X POST http://localhost:3000/api/admin/seed
 *
 * No-op (501) when DATABASE_URL is not configured. In production, protect this
 * route behind auth or remove it after the first run.
 */
export async function POST() {
  const session = await getSession();
  if (!session || !isVoxAdmin(session.email)) {
    return Response.json({ error: "Vox administrator access required." }, { status: 403 });
  }
  if (!isDbEnabled) {
    return Response.json(
      {
        ok: false,
        message:
          "DATABASE_URL is not set — the app is running on in-memory demo data.",
      },
      { status: 501 }
    );
  }

  await initSchema();

  // Demo workspace + owner (login: demo@vox.ai / demo1234)
  await sql!`
    insert into workspaces (id, name, plan, subscription_status)
    values ('ws_demo', 'Bright Smile Dental', 'growth', 'active')
    on conflict (id) do update set plan = 'growth', subscription_status = 'active'
  `;
  await sql!`
    insert into users (id, workspace_id, email, password_hash, name, role)
    values ('u_demo', 'ws_demo', 'demo@vox.ai', ${hashPassword("demo1234")}, 'Demo User', 'Owner')
    on conflict (email) do nothing
  `;

  for (const a of agents) await upsertAgent(a, "ws_demo");
  for (const c of conversations) await insertConversation(c, "ws_demo");

  // Route real Twilio numbers to the demo workspace, if configured, so voice
  // calls / WhatsApp messages work immediately after connecting a number.
  const voiceNumber = process.env.TWILIO_PHONE_NUMBER;
  if (voiceNumber) {
    const voiceAgent = agents.find((a) => a.type === "voice" && a.status === "active") ?? agents[0];
    await upsertPhoneNumber(
      { id: "pn_demo_voice", number: voiceNumber, channel: "voice", agentId: voiceAgent.id },
      "ws_demo"
    );
  }
  const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  if (whatsappNumber) {
    const chatAgent = agents.find((a) => a.type === "chat" && a.status === "active") ?? agents[0];
    await upsertPhoneNumber(
      { id: "pn_demo_whatsapp", number: whatsappNumber, channel: "whatsapp", agentId: chatAgent.id },
      "ws_demo"
    );
  }

  // Ingest the demo knowledge base once so RAG has data to retrieve.
  const existing = await sql!`
    select count(*)::int n from knowledge_sources where workspace_id = 'ws_demo'
  `;
  let knowledge = existing[0].n as number;
  if (knowledge === 0) {
    await ingestSource({
      workspaceId: "ws_demo",
      name: "Bright Smile — Services & Policies",
      type: "FAQ",
      content: demoKnowledgeBase,
    });
    knowledge = 1;
  }

  return Response.json({
    ok: true,
    login: { email: "demo@vox.ai", password: "demo1234" },
    seeded: {
      agents: agents.length,
      conversations: conversations.length,
      knowledgeSources: knowledge,
      voiceNumberRouted: Boolean(voiceNumber),
      whatsappNumberRouted: Boolean(whatsappNumber),
    },
  });
}

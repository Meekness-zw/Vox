import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the inbox integration test.");
const baseUrl = (process.env.VOX_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const suffix = crypto.randomUUID().replaceAll("-", "");
const workspaceId = `ws_inbox_${suffix}`;
const userId = `u_inbox_${suffix}`;
const agentId = `ag_inbox_${suffix}`;
const widgetToken = `wgt_inbox_${suffix}`;
const visitorId = crypto.randomUUID();
const messageId = crypto.randomUUID();

const { sql } = await import("../src/lib/db/index.ts");
const { signSession } = await import("../src/lib/auth/session.ts");

try {
  await sql.begin(async (tx) => {
    await tx`insert into workspaces(id,name) values(${workspaceId},'Inbox integration test')`;
    await tx`
      insert into users(id,workspace_id,email,password_hash,name,role,status)
      values(${userId},${workspaceId},${`inbox-${suffix}@example.test`},'not-a-login','Test Owner','Owner','active')
    `;
    await tx`
      insert into agents(id,workspace_id,name,type,status,language,personality,system_prompt,greeting,business_hours,escalation)
      values(${agentId},${workspaceId},'Inbox Test Agent','chat','active','English and Shona',
        'Professional','Help the customer.','Hello','Always open','Offer a human when needed.')
    `;
    await tx`
      insert into widget_configs(workspace_id,public_token,agent_id,title,welcome_message,allowed_domains)
      values(${workspaceId},${widgetToken},${agentId},'Inbox test','Hello',${sql.json([])})
    `;
  });

  const payload = {
    token: widgetToken,
    conversationId: visitorId,
    messageId,
    messages: [{ role: "user", content: "Please connect me to a real person" }],
  };
  const first = await fetch(`${baseUrl}/api/widget/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const firstBody = await first.json();
  assert.equal(first.status, 200, JSON.stringify(firstBody));
  assert.equal(firstBody.inboxStatus, "needs_human");
  assert.match(String(firstBody.reply), /notified the team/i);

  // Later sends must present the thread token issued with the first reply.
  const threadToken = String(firstBody.threadToken ?? "");
  assert.match(threadToken, /^[\w-]+\.[\w-]+$/, "The first reply must issue a thread token.");
  const unauthorized = await fetch(`${baseUrl}/api/widget/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(unauthorized.status, 403, "A send without the thread token must be rejected.");

  const duplicate = await fetch(`${baseUrl}/api/widget/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payload, threadToken }),
  });
  assert.equal(duplicate.status, 200);

  const conversationId = `widget_${workspaceId}_${visitorId}`;
  const [state] = await sql`
    select inbox_status,bot_mode,priority from conversations
    where id=${conversationId} and workspace_id=${workspaceId}
  `;
  assert.equal(state.inbox_status, "needs_human");
  assert.equal(state.bot_mode, "paused");
  assert.equal(state.priority, "high");
  const [counts] = await sql`
    select
      (select count(*)::int from conversation_messages where workspace_id=${workspaceId}) messages,
      (select count(*)::int from inbox_notifications where workspace_id=${workspaceId}) notifications
  `;
  assert.equal(Number(counts.messages), 2, "The duplicate request must not append or send again.");
  assert.equal(Number(counts.notifications), 1, "One handoff should produce one owner notification.");

  const poll = await fetch(`${baseUrl}/api/widget/chat?${new URLSearchParams({
    token: widgetToken,
    conversationId: visitorId,
    threadToken,
    after: "0",
  })}`);
  const pollBody = await poll.json();
  assert.equal(poll.status, 200, JSON.stringify(pollBody));
  assert.equal(pollBody.inboxStatus, "needs_human");
  assert.equal(pollBody.messages.length, 1);
  assert.equal(pollBody.messages[0].authorType, "bot");

  const session = await signSession({
    userId,
    workspaceId,
    email: `inbox-${suffix}@example.test`,
    name: "Test Owner",
    role: "Owner",
  });
  const dashboard = await fetch(
    `${baseUrl}/dashboard/conversations?conversation=${encodeURIComponent(conversationId)}`,
    { headers: { cookie: `vox_session=${session}` }, redirect: "manual" }
  );
  const html = await dashboard.text();
  assert.equal(dashboard.status, 200);
  assert.equal(html.includes("Needs human"), true);
  assert.equal(html.includes("Please connect me to a real person"), true);
  console.log("team inbox integration passed (handoff, idempotency, notification, polling, dashboard)");
} finally {
  await sql`delete from widget_rate_limits where bucket like ${`${widgetToken}:%`}`;
  await sql`delete from workspaces where id=${workspaceId}`;
  await sql.end();
}

import assert from "node:assert/strict";

const appUrl = (process.env.VOX_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
const botUrl = (process.env.VOX_BOT_SERVICE_URL || "").replace(/\/$/, "");
assert.ok(appUrl.startsWith("https://"), "VOX_APP_URL or NEXT_PUBLIC_APP_URL must be an HTTPS deployment.");
assert.ok(botUrl.startsWith("https://"), "VOX_BOT_SERVICE_URL must be an HTTPS deployment.");

const [appResponse, healthResponse] = await Promise.all([
  fetch(`${appUrl}/api/voice/incoming?deployment-audit=${Date.now()}`, { method: "HEAD" }),
  fetch(`${botUrl}/health`, { cache: "no-store" }),
]);
assert.equal(appResponse.headers.get("x-content-type-options"), "nosniff");
assert.equal(appResponse.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
assert.ok(appResponse.headers.get("permissions-policy")?.includes("microphone=(self)"));
assert.equal(healthResponse.ok, true, `Python health returned HTTP ${healthResponse.status}`);
const health = await healthResponse.json();
assert.equal(health.status, "ok");
assert.equal(health.version, "1.1.0", "Railway is not running the audited Python release.");
assert.equal(health.voice_pipeline, "bilingual-v2");
console.log("deployment audit passed (Vercel security headers and Railway 1.1.0)");

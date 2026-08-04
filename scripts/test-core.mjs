import assert from "node:assert/strict";

process.env.SESSION_SECRET = "test-secret-that-is-long-and-not-used-in-production";
const { signSession, verifySession } = await import("../src/lib/auth/session.ts");
const { isValidBusinessSchedule, isValidTimezone } = await import("../src/lib/business-schedule.ts");
const { signWidgetEmbed, verifyWidgetEmbed, widgetDomainAllowed } = await import("../src/lib/widget-auth.ts");
const { currencyFractionDigits, majorToMinor } = await import("../src/lib/currency.ts");
const {
  hasConfirmedHumanHandoff,
  handoffAcknowledgement,
  isAffirmativeHandoffReply,
  isDirectHumanRequest,
  isHumanHandoffOffer,
} = await import("../src/lib/handoff-detection.ts");

const token = await signSession({
  userId: "u_test", workspaceId: "ws_test", email: "owner@example.com", name: "Owner",
});
assert.equal((await verifySession(token))?.workspaceId, "ws_test");
const replacement = token.endsWith("x") ? "y" : "x";
assert.equal(await verifySession(`${token.slice(0, -1)}${replacement}`), null);
assert.equal(await verifySession("not-a-session"), null);

const schedule = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
  .map((day) => ({ day, enabled: day !== "Sunday", opens: "09:00", closes: "17:00" }));
assert.equal(isValidBusinessSchedule(schedule), true);
assert.equal(isValidBusinessSchedule([...schedule.slice(0, 6), schedule[0]]), false);
assert.equal(isValidBusinessSchedule(schedule.map((entry) => ({ ...entry, opens: "18:00" }))), false);
assert.equal(isValidTimezone("Africa/Harare"), true);
assert.equal(isValidTimezone("Not/A_Timezone"), false);

assert.equal(widgetDomainAllowed("shop.example.com", ["example.com"]), true);
assert.equal(widgetDomainAllowed("example.com.attacker.test", ["example.com"]), false);
const proof = signWidgetEmbed("wgt_test", "shop.example.com");
assert.equal(verifyWidgetEmbed(proof, "wgt_test", ["example.com"]), true);
assert.equal(verifyWidgetEmbed(proof, "wgt_other", ["example.com"]), false);

assert.equal(currencyFractionDigits("USD"), 2);
assert.equal(currencyFractionDigits("JPY"), 0);
assert.equal(currencyFractionDigits("KWD"), 3);
assert.equal(majorToMinor(12.34, "USD"), 1234);
assert.equal(majorToMinor(12, "JPY"), 12);
assert.equal(majorToMinor(12.345, "KWD"), 12345);
assert.throws(() => majorToMinor(12.345, "USD"), /too many decimal places/);

assert.equal(isDirectHumanRequest("Please connect me to a real person"), true);
assert.equal(isDirectHumanRequest("Ndibatanidzei nemunhu ndapota"), true);
assert.equal(isDirectHumanRequest("I don't want to speak to a human"), false);
assert.equal(isHumanHandoffOffer("Would you like me to connect you to a team member?"), true);
assert.equal(isAffirmativeHandoffReply("Yes, please connect me"), true);
assert.equal(isAffirmativeHandoffReply("Kwete"), false);
assert.equal(hasConfirmedHumanHandoff([
  { role: "assistant", content: "Would you like me to connect you to a team member?" },
  { role: "user", content: "Hongu ndapota" },
]), true);
assert.equal(hasConfirmedHumanHandoff([
  { role: "assistant", content: "Would you like to book Tuesday?" },
  { role: "user", content: "Yes please" },
]), false);
assert.match(handoffAcknowledgement("Yes, please connect me", "whatsapp"), /^Thanks/);
assert.match(handoffAcknowledgement("Hongu ndibatanidzei", "whatsapp"), /^Hongu/);
assert.equal(hasConfirmedHumanHandoff([
  { role: "assistant", content: "I can help with Human Resources opening hours." },
  { role: "user", content: "Yes" },
]), false);

console.log("core TypeScript assertions passed");

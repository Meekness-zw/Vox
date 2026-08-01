import {
  findWorkspaceByStripeSubscription,
  getBotRequest,
  getWorkspaceSubscription,
  claimWebhookEvent,
  completeWebhookEvent,
  releaseWebhookEvent,
  updateBotRequest,
  updateWorkspaceSubscription,
} from "@/lib/repository";

export const runtime = "nodejs";

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function verifySignature(payload: string, header: string, secret: string) {
  const parts = header.split(",").map((part) => part.trim().split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key, value]) => key === "v1" && value).map(([, value]) => value);
  const timestampNumber = Number(timestamp);
  if (!timestamp || !Number.isFinite(timestampNumber) || !signatures.length || Math.abs(Date.now() / 1000 - timestampNumber) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((signature) => safeEqual(expected, signature));
}

function invoiceSubscriptionId(object: Record<string, unknown>) {
  if (typeof object.subscription === "string") return object.subscription;
  if (!object.parent || typeof object.parent !== "object") return "";
  const details = (object.parent as Record<string, unknown>).subscription_details;
  if (!details || typeof details !== "object") return "";
  const subscription = (details as Record<string, unknown>).subscription;
  return typeof subscription === "string" ? subscription : "";
}

async function subscriptionDueAt(subscriptionId: string, secret: string) {
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!response.ok) return undefined;
  const subscription = await response.json() as { current_period_end?: number };
  return subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : undefined;
}

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!webhookSecret || !stripeSecret) {
    return Response.json({ error: "Stripe webhook is not configured." }, { status: 501 });
  }
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";
  if (!(await verifySignature(payload, signature, webhookSecret))) {
    return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }
  let event: StripeEvent;
  try { event = JSON.parse(payload) as StripeEvent; }
  catch { return Response.json({ error: "Invalid Stripe payload." }, { status: 400 }); }
  if (!event.id?.startsWith("evt_") || !event.type || !event.data?.object) {
    return Response.json({ error: "Invalid Stripe event." }, { status: 400 });
  }
  const eventKey = `stripe:${event.id}`;
  const claim = await claimWebhookEvent(eventKey, "stripe");
  if (!claim.claimed) return Response.json({ received: true, duplicate: true });
  const object = event.data.object;

  try {

  if (event.type === "checkout.session.completed") {
    const metadata = (object.metadata ?? {}) as Record<string, string>;
    const workspaceId = metadata.workspace_id || String(object.client_reference_id ?? "");
    const subscriptionId = typeof object.subscription === "string" ? object.subscription : undefined;
    if (workspaceId && subscriptionId) {
      await updateWorkspaceSubscription({
        workspaceId,
        plan: metadata.plan_id || "starter",
        status: "active",
        dueAt: await subscriptionDueAt(subscriptionId, stripeSecret),
        stripeCustomerId: typeof object.customer === "string" ? object.customer : undefined,
        stripeSubscriptionId: subscriptionId,
      });
      if (metadata.bot_request_id) {
        const request = await getBotRequest(metadata.bot_request_id, workspaceId);
        if (request && request.status === "payment_required") {
          await updateBotRequest({
            id: metadata.bot_request_id, workspaceId,
            status: "submitted",
            adminNotes: "Payment confirmed. Your custom bot is ready for Vox review.",
          });
        }
      }
    }
  }

  if (event.type === "invoice.payment_failed" || event.type === "invoice.paid") {
    const subscriptionId = invoiceSubscriptionId(object);
    const workspaceId = subscriptionId
      ? await findWorkspaceByStripeSubscription(subscriptionId)
      : undefined;
    if (workspaceId) {
      const current = await getWorkspaceSubscription(workspaceId);
      await updateWorkspaceSubscription({
        workspaceId,
        plan: current.plan,
        status: event.type === "invoice.paid" ? "active" : "past_due",
      });
    }
  }

    await completeWebhookEvent(eventKey);
    return Response.json({ received: true });
  } catch (error) {
    await releaseWebhookEvent(eventKey);
    throw error;
  }
}

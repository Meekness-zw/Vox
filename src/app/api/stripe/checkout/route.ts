import { plans } from "@/lib/pricing";
import { requireSession } from "@/lib/auth/session-cookies";
import { getBotRequest } from "@/lib/repository";
import { bodyTooLarge } from "@/lib/api-security";

/**
 * Creates a Stripe Checkout session for a plan.
 *
 * Uses the Stripe REST API directly (no SDK dependency). To enable, set:
 *   STRIPE_SECRET_KEY            sk_live_… / sk_test_…
 *   STRIPE_PRICE_STARTER         price_…  ($99/mo)
 *   STRIPE_PRICE_GROWTH          price_…  ($299/mo)
 *   STRIPE_PRICE_PRO             price_…  ($799/mo)
 *
 * Without configuration the route returns a clear 501 so the UI can explain
 * what to set up — the rest of the app keeps working.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (bodyTooLarge(req, 16_000)) return Response.json({ error: "Request is too large." }, { status: 413 });
  let requestBody: { planId?: string; botRequestId?: string };
  try { requestBody = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { planId, botRequestId } = requestBody;
  const plan = plans.find((p) => p.id === planId);

  if (!plan || plan.price === null) {
    return Response.json(
      { error: "Unknown or contact-sales plan." },
      { status: 400 }
    );
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env[`STRIPE_PRICE_${plan.id.toUpperCase()}`];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const origin = new URL(appUrl).origin;

  if (!secret || !priceId) {
    return Response.json(
      {
        error: "billing_not_configured",
        message:
          "Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_* to enable checkout.",
      },
      { status: 501 }
    );
  }

  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/dashboard/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard/billing?status=cancelled`,
    allow_promotion_codes: "true",
    client_reference_id: session.workspaceId,
    customer_email: session.email,
    "metadata[workspace_id]": session.workspaceId,
    "metadata[plan_id]": plan.id,
  });
  if (botRequestId) {
    const request = await getBotRequest(botRequestId, session.workspaceId);
    if (!request) return Response.json({ error: "Bot request not found." }, { status: 404 });
    body.set("metadata[bot_request_id]", botRequestId);
  }

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const detail = await res.text();
    return Response.json(
      { error: "stripe_error", detail },
      { status: 502 }
    );
  }

  const checkoutSession = (await res.json()) as { url?: string };
  return Response.json({ url: checkoutSession.url });
}

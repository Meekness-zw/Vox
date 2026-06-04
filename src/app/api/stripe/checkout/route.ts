import { plans } from "@/lib/pricing";

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
  const { planId } = (await req.json()) as { planId?: string };
  const plan = plans.find((p) => p.id === planId);

  if (!plan || plan.price === null) {
    return Response.json(
      { error: "Unknown or contact-sales plan." },
      { status: 400 }
    );
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env[`STRIPE_PRICE_${plan.id.toUpperCase()}`];
  const origin =
    req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

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
    success_url: `${origin}/dashboard/billing?status=success`,
    cancel_url: `${origin}/dashboard/billing?status=cancelled`,
    allow_promotion_codes: "true",
  });

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

  const session = (await res.json()) as { url?: string };
  return Response.json({ url: session.url });
}

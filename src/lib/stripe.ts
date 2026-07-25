import { updateBotRequest, updateWorkspaceSubscription } from "@/lib/repository";

type CheckoutSession = {
  payment_status?: string;
  status?: string;
  customer?: string;
  subscription?: string;
  client_reference_id?: string;
  metadata?: Record<string, string>;
};

/** Confirm a returned Checkout session server-side; never trusts URL parameters alone. */
export async function confirmStripeCheckout(sessionId: string, workspaceId: string) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || !sessionId.startsWith("cs_")) return false;
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
  });
  if (!response.ok) return false;
  const session = await response.json() as CheckoutSession;
  const owner = session.metadata?.workspace_id || session.client_reference_id;
  if (owner !== workspaceId || session.status !== "complete" || !session.subscription) return false;

  let dueAt: string | undefined;
  const subResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${session.subscription}`, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
  });
  if (subResponse.ok) {
    const subscription = await subResponse.json() as { current_period_end?: number };
    if (subscription.current_period_end) dueAt = new Date(subscription.current_period_end * 1000).toISOString();
  }
  await updateWorkspaceSubscription({
    workspaceId,
    plan: session.metadata?.plan_id || "starter",
    status: "active",
    dueAt,
    stripeCustomerId: session.customer,
    stripeSubscriptionId: session.subscription,
  });
  if (session.metadata?.bot_request_id) {
    await updateBotRequest({
      id: session.metadata.bot_request_id,
      status: "submitted",
      adminNotes: "Payment confirmed. Your custom bot is now in the Vox review queue.",
    });
  }
  return true;
}

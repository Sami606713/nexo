import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { applyStripeSubscription, stripe } from "../../billing/_lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subIdOf = (v: string | Stripe.Subscription | null | undefined) => (!v ? null : typeof v === "string" ? v : v.id);

/** Stripe webhook: verifies the signature on the raw body, then syncs the Subscription row. */
export async function POST(req: Request) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return NextResponse.json({ error: "Stripe isn't configured" }, { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    return NextResponse.json({ error: `Invalid signature: ${(err as Error).message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const subId = subIdOf(session.subscription);
        if (session.mode === "subscription" && subId) {
          const sub = await s.subscriptions.retrieve(subId);
          await applyStripeSubscription(sub, session.client_reference_id ?? session.metadata?.userId ?? null);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applyStripeSubscription(event.data.object, event.data.object.metadata?.userId ?? null);
        break;
      case "invoice.paid": {
        const inv = event.data.object;
        const legacy = inv as unknown as { subscription?: string | Stripe.Subscription | null };
        const subId = subIdOf(inv.parent?.subscription_details?.subscription) ?? subIdOf(legacy.subscription);
        if (subId) await applyStripeSubscription(await s.subscriptions.retrieve(subId));
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe webhook]", event.type, err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

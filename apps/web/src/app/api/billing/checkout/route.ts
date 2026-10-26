import { z } from "zod";
import { prisma } from "@postline/db";
import { HttpError, parseBody, route } from "@/lib/http";
import { PAID_PLANS, type Interval, appUrl, demoBilling, demoSwitchPlan, lineItem, stripe } from "../_lib/stripe";
import { billingTarget } from "../_lib/target";

const schema = z.object({
  plan: z.enum(PAID_PLANS),
  interval: z.enum(["month", "year"]).default("month"),
  brandId: z.string().optional(),
});

/** POST {plan, interval, brandId?} → {url} (Stripe Checkout) or {demo: true} (dev without Stripe). */
export const POST = route(async (req) => {
  const body = await parseBody(req, schema);
  const interval: Interval = body.interval ?? "month";
  const { user, brandId } = await billingTarget(body.brandId);

  const s = stripe();
  if (!s) {
    if (!demoBilling()) throw new HttpError(503, "Billing isn't configured on this server");
    await demoSwitchPlan(user.id, body.plan, interval);
    return { demo: true, plan: body.plan };
  }

  const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
  let customer = sub?.stripeCustomerId ?? null;
  if (!customer) {
    const c = await s.customers.create({ email: user.email, name: user.name ?? undefined, metadata: { userId: user.id } });
    customer = c.id;
    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: { stripeCustomerId: customer },
      create: { userId: user.id, stripeCustomerId: customer },
    });
  }
  // Already subscribed → plan changes go through the billing portal (proration handled by Stripe).
  if (sub?.stripeSubId && sub.status !== "canceled") {
    const portal = await s.billingPortal.sessions.create({ customer, return_url: returnUrl(brandId) });
    return { url: portal.url, portal: true };
  }

  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [await lineItem(s, body.plan, interval)],
    subscription_data: {
      trial_period_days: sub?.stripeSubId ? undefined : 7,
      metadata: { userId: user.id, plan: body.plan, interval },
    },
    metadata: { userId: user.id, plan: body.plan },
    allow_promotion_codes: true,
    success_url: `${returnUrl(brandId)}?checkout=success`,
    cancel_url: `${returnUrl(brandId)}?checkout=cancelled`,
  });
  return { url: session.url };
});

const returnUrl = (brandId?: string) => (brandId ? `${appUrl()}/app/${brandId}/settings/billing` : `${appUrl()}/app`);

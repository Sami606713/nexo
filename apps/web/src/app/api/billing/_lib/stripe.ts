import "server-only";
import Stripe from "stripe";
import { prisma } from "@postline/db";
import { PLAN_LIMITS, type PlanId } from "@postline/core";
import { HttpError } from "@/lib/http";

export const PAID_PLANS = ["STARTER", "TEAM", "AGENCY"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
export type Interval = "month" | "year";

let client: Stripe | null = null;
export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key, { appInfo: { name: process.env.APP_NAME ?? "Nexo" } });
  return client;
}

/** No Stripe key and not production → plan changes apply instantly (for demos). */
export const demoBilling = () => !process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV !== "production";

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export function monthlyPriceId(plan: PaidPlan): string {
  const id = process.env[`STRIPE_PRICE_${plan}`];
  if (!id) throw new HttpError(503, `Billing for the ${PLAN_LIMITS[plan].label} plan isn't configured yet`);
  return id;
}

/** Yearly = optional STRIPE_PRICE_<PLAN>_YEARLY, else derived as 10× the monthly price ("2 months free"). */
export async function lineItem(s: Stripe, plan: PaidPlan, interval: Interval): Promise<Stripe.Checkout.SessionCreateParams.LineItem> {
  const monthly = monthlyPriceId(plan);
  if (interval === "month") return { price: monthly, quantity: 1 };
  const yearly = process.env[`STRIPE_PRICE_${plan}_YEARLY`];
  if (yearly) return { price: yearly, quantity: 1 };
  const price = await s.prices.retrieve(monthly);
  const product = typeof price.product === "string" ? price.product : price.product.id;
  const unit = (price.unit_amount ?? (PLAN_LIMITS[plan].priceMonthlyUsd ?? 0) * 100) * 10;
  return { price_data: { currency: price.currency, product, unit_amount: unit, recurring: { interval: "year" } }, quantity: 1 };
}

export function planFromPrice(priceId: string | undefined | null): PaidPlan | null {
  if (!priceId) return null;
  for (const p of PAID_PLANS) if (process.env[`STRIPE_PRICE_${p}`] === priceId || process.env[`STRIPE_PRICE_${p}_YEARLY`] === priceId) return p;
  return null;
}

const resetDayOf = (d: Date) => Math.min(d.getUTCDate(), 28);

/**
 * Apply a Stripe subscription to our Subscription row: plan, status, period, monthly credits.
 * Refills credits (creditsUsed → 0 + ledger "refill") when a new billing period started.
 */
export async function applyStripeSubscription(sub: Stripe.Subscription, userIdHint?: string | null): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const existing =
    (await prisma.subscription.findFirst({ where: { OR: [{ stripeSubId: sub.id }, { stripeCustomerId: customerId }] } })) ??
    (userIdHint ? await prisma.subscription.findUnique({ where: { userId: userIdHint } }) : null);
  const userId = existing?.userId ?? userIdHint ?? (sub.metadata?.userId || null);
  if (!userId) {
    console.warn("[stripe] subscription without a known user", sub.id);
    return;
  }
  const item = sub.items.data[0];
  const metaPlan = sub.metadata?.plan as PlanId | undefined;
  const plan: PlanId =
    sub.status === "canceled" || sub.status === "incomplete_expired"
      ? "TRIAL"
      : metaPlan && metaPlan in PLAN_LIMITS
        ? metaPlan
        : (planFromPrice(item?.price.id) ?? existing?.plan ?? "STARTER");
  const legacy = sub as unknown as { current_period_start?: number; current_period_end?: number };
  const startSec = item?.current_period_start ?? legacy.current_period_start;
  const endSec = item?.current_period_end ?? legacy.current_period_end;
  const periodStart = startSec ? new Date(startSec * 1000) : new Date();
  const periodEnd = endSec ? new Date(endSec * 1000) : null;
  const status = sub.status === "canceled" ? "canceled" : sub.status === "trialing" ? "trialing" : sub.status === "active" ? "active" : "past_due";
  const newPeriod = !existing || existing.periodStart.getTime() < periodStart.getTime() - 60_000;

  await prisma.$transaction(async (tx) => {
    const data = {
      plan,
      status,
      stripeCustomerId: customerId,
      stripeSubId: sub.status === "canceled" ? null : sub.id,
      creditsMonthly: PLAN_LIMITS[plan].creditsMonthly,
      ...(newPeriod ? { periodStart, resetDay: resetDayOf(periodStart), creditsUsed: 0 } : {}),
      periodEnd,
    };
    await tx.subscription.upsert({ where: { userId }, update: data, create: { userId, ...data, periodStart, resetDay: resetDayOf(periodStart) } });
    if (newPeriod && existing && existing.creditsUsed > 0)
      await tx.creditLedger.create({ data: { userId, delta: existing.creditsUsed, reason: "refill", refType: "stripe", refId: sub.id } });
  });
}

/** Instant plan switch (demo mode only). */
export async function demoSwitchPlan(userId: string, plan: PaidPlan, interval: Interval): Promise<void> {
  const now = new Date();
  const end = new Date(now);
  if (interval === "year") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  await prisma.subscription.upsert({
    where: { userId },
    update: { plan, status: "active", creditsMonthly: PLAN_LIMITS[plan].creditsMonthly, periodEnd: end },
    create: { userId, plan, status: "active", creditsMonthly: PLAN_LIMITS[plan].creditsMonthly, periodStart: now, periodEnd: end, resetDay: resetDayOf(now) },
  });
}

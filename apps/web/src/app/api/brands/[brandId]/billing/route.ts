import { prisma } from "@postline/db";
import { PLAN_LIMITS } from "@postline/core";
import { remainingCredits } from "@postline/ai";
import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { ownerChannelKeys, ownerPlan, ownerSeatCount } from "@/lib/billing";
import { demoBilling } from "@/app/api/billing/_lib/stripe";

type Ctx = { params: Promise<{ brandId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId, "billing.manage");
  const { ownerId, plan, limits } = await ownerPlan(brandId);
  const [sub, credits, channels, seats, ledger] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId: ownerId } }),
    remainingCredits(brandId),
    ownerChannelKeys(ownerId),
    ownerSeatCount(ownerId),
    prisma.creditLedger.findMany({ where: { userId: ownerId }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const brandNames = new Map(
    (await prisma.brand.findMany({ where: { ownerId }, select: { id: true, name: true } })).map((b) => [b.id, b.name]),
  );
  return {
    plan,
    limits,
    plans: PLAN_LIMITS,
    subscription: sub && {
      status: sub.status,
      periodStart: sub.periodStart,
      periodEnd: sub.periodEnd,
      resetDay: sub.resetDay,
      hasCustomer: !!sub.stripeCustomerId,
      hasStripeSubscription: !!sub.stripeSubId,
    },
    billing: { stripe: !!process.env.STRIPE_SECRET_KEY, demo: demoBilling() },
    credits,
    usage: { channels: channels.size, users: seats.total },
    ledger: ledger.map((l) => ({
      id: l.id,
      delta: l.delta,
      reason: l.reason,
      brandName: l.brandId ? (brandNames.get(l.brandId) ?? null) : null,
      createdAt: l.createdAt,
    })),
  };
});

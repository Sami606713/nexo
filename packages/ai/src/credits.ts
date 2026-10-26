// OWNED BY: ai agent. Credit pool accounting. Credits belong to the brand OWNER's Subscription.
import { InsufficientCreditsError, PLAN_LIMITS } from "@postline/core";
import type { CreditReason } from "@postline/core";
import { prisma } from "@postline/db";
import { computeRemaining, dueRefill, validateAmount } from "./credits-math";

export interface ChargeParams {
  brandId: string;
  actorId: string;
  reason: CreditReason;
  amount: number;
  refType?: string;
  refId?: string;
}

export { validateAmount, computeRemaining, refillBoundary, nextRefillAfter, dueRefill } from "./credits-math";

// ---------------------------------------------------------------- DB operations

async function ownerOf(brandId: string): Promise<string> {
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { ownerId: true } });
  if (!brand) throw new Error(`Brand not found: ${brandId}`);
  return brand.ownerId;
}

/** Make sure the owner has a Subscription row (creates a TRIAL one if missing). */
export async function ensureSubscription(userId: string, now = new Date()): Promise<void> {
  const existing = await prisma.subscription.findUnique({ where: { userId }, select: { id: true } });
  if (existing) return;
  try {
    await prisma.subscription.create({
      data: {
        userId,
        plan: "TRIAL",
        status: "trialing",
        creditsMonthly: PLAN_LIMITS.TRIAL.creditsMonthly,
        creditsUsed: 0,
        periodStart: now,
        resetDay: Math.min(now.getUTCDate(), 28),
      },
    });
  } catch (e) {
    // Lost a race with a concurrent create — the row exists now, which is all we need.
    if ((e as { code?: string })?.code !== "P2002") throw e;
  }
}

/** Remaining credits for the owner of `brandId`. */
export async function remainingCredits(brandId: string): Promise<{ remaining: number; monthly: number }> {
  const userId = await ownerOf(brandId);
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { creditsMonthly: true, creditsUsed: true },
  });
  return computeRemaining(sub);
}

/** Atomically charge `amount` credits to the owner. Throws InsufficientCreditsError if short. */
export async function chargeCredits(params: ChargeParams): Promise<{ userId: string }> {
  const amount = validateAmount(params.amount);
  const userId = await ownerOf(params.brandId);
  if (amount === 0) return { userId };
  await ensureSubscription(userId);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.$executeRaw`
      UPDATE "Subscription"
      SET "creditsUsed" = "creditsUsed" + ${amount}, "updatedAt" = NOW()
      WHERE "userId" = ${userId} AND "creditsMonthly" - "creditsUsed" >= ${amount}`;
    if (updated !== 1) {
      const sub = await tx.subscription.findUnique({ where: { userId }, select: { creditsMonthly: true, creditsUsed: true } });
      throw new InsufficientCreditsError(amount, computeRemaining(sub).remaining);
    }
    await tx.creditLedger.create({
      data: {
        userId,
        brandId: params.brandId,
        actorId: params.actorId,
        delta: -amount,
        reason: params.reason,
        refType: params.refType,
        refId: params.refId,
      },
    });
  });
  return { userId };
}

/** Give back credits charged by `chargeCredits` (never drives creditsUsed below 0). */
export async function refundCredits(userId: string, params: ChargeParams): Promise<void> {
  const amount = validateAmount(params.amount);
  if (amount === 0) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "Subscription"
      SET "creditsUsed" = GREATEST("creditsUsed" - ${amount}, 0), "updatedAt" = NOW()
      WHERE "userId" = ${userId}`;
    await tx.creditLedger.create({
      data: {
        userId,
        brandId: params.brandId,
        actorId: params.actorId,
        delta: amount,
        reason: "refund",
        refType: params.refType ?? params.reason,
        refId: params.refId,
      },
    });
  });
}

/**
 * Charge the brand OWNER's credit pool atomically, run `fn`, refund on failure.
 * Throws InsufficientCreditsError (from @postline/core) before running if the balance is short.
 */
export async function withCredits<T>(params: ChargeParams, fn: () => Promise<T>): Promise<T> {
  const { userId } = await chargeCredits(params);
  try {
    return await fn();
  } catch (err) {
    try {
      await refundCredits(userId, params);
    } catch (refundErr) {
      console.error("[credits] refund failed", { brandId: params.brandId, amount: params.amount, refundErr });
    }
    throw err;
  }
}

/**
 * Maintenance job: reset `creditsUsed` for every subscription whose reset day passed since its
 * `periodStart`, advance `periodStart`, and write a "refill" ledger row. Idempotent (guards on the
 * old periodStart). Returns the number of subscriptions refilled.
 */
export async function refillCreditsIfDue(now: Date = new Date()): Promise<number> {
  let refilled = 0;
  let cursor: string | undefined;
  const PAGE = 500;
  for (;;) {
    const subs = await prisma.subscription.findMany({
      where: { status: { not: "canceled" }, periodStart: { lte: now } },
      select: { id: true, userId: true, periodStart: true, resetDay: true },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (subs.length === 0) break;
    cursor = subs[subs.length - 1]?.id;
    for (const sub of subs) {
      const newStart = dueRefill(sub.periodStart, sub.resetDay, now);
      if (!newStart) continue;
      const done = await prisma.$transaction(async (tx) => {
        // Lock the row so the ledger delta reflects exactly what was used at reset time.
        const locked = await tx.$queryRaw<Array<{ creditsUsed: number }>>`
          SELECT "creditsUsed" FROM "Subscription"
          WHERE "id" = ${sub.id} AND "periodStart" = ${sub.periodStart}
          FOR UPDATE`;
        const used = locked[0]?.creditsUsed;
        if (used === undefined) return false; // already refilled by a concurrent run
        await tx.subscription.update({ where: { id: sub.id }, data: { creditsUsed: 0, periodStart: newStart } });
        await tx.creditLedger.create({
          data: { userId: sub.userId, delta: used, reason: "refill", refType: "subscription", refId: sub.id },
        });
        return true;
      });
      if (done) refilled++;
    }
    if (subs.length < PAGE) break;
  }
  return refilled;
}

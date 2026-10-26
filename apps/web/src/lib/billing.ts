// OWNED BY: web-platform agent.
import "server-only";
import { prisma } from "@postline/db";
import { PLAN_LIMITS, type PlanId, type PlanLimits } from "@postline/core";

export async function ensureSubscription(userId: string) {
  return prisma.subscription.upsert({
    where: { userId },
    update: {},
    create: { userId, plan: "TRIAL", status: "trialing", creditsMonthly: PLAN_LIMITS.TRIAL.creditsMonthly },
  });
}

/** Plan + limits of the OWNER of `brandId`. */
export async function ownerPlan(brandId: string): Promise<{ ownerId: string; plan: PlanId; limits: PlanLimits }> {
  const brand = await prisma.brand.findUniqueOrThrow({
    where: { id: brandId },
    select: { ownerId: true, owner: { select: { subscription: { select: { plan: true } } } } },
  });
  const plan = (brand.owner.subscription?.plan ?? "TRIAL") as PlanId;
  return { ownerId: brand.ownerId, plan, limits: PLAN_LIMITS[plan] };
}

/** Distinct (network, externalId) channels across all brands owned by `ownerId`. */
export async function ownerChannelKeys(ownerId: string): Promise<Set<string>> {
  const rows = await prisma.channel.findMany({
    where: { brand: { ownerId } },
    select: { network: true, externalId: true },
  });
  return new Set(rows.map((r) => `${r.network}:${r.externalId}`));
}

/** Distinct users across all brands owned by `ownerId` (members + pending, unexpired invites). */
export async function ownerSeatCount(ownerId: string): Promise<{ members: number; pending: number; total: number }> {
  const [members, invites] = await Promise.all([
    prisma.membership.findMany({ where: { brand: { ownerId } }, select: { userId: true, user: { select: { email: true } } } }),
    prisma.invite.findMany({
      where: { brand: { ownerId }, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { email: true },
    }),
  ]);
  const memberIds = new Set(members.map((m) => m.userId));
  const memberEmails = new Set(members.map((m) => m.user.email.toLowerCase()));
  const pendingEmails = new Set(invites.map((i) => i.email.toLowerCase()).filter((e) => !memberEmails.has(e)));
  return { members: memberIds.size, pending: pendingEmails.size, total: memberIds.size + pendingEmails.size };
}

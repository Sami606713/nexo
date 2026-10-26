// OWNED BY: ai agent. Pure credit math (no DB) — unit-tested.
import { PLAN_LIMITS } from "@postline/core";

export function validateAmount(amount: number): number {
  if (!Number.isInteger(amount) || amount < 0) throw new Error(`Invalid credit amount: ${amount}`);
  return amount;
}

export function computeRemaining(sub: { creditsMonthly: number; creditsUsed: number } | null | undefined): {
  remaining: number;
  monthly: number;
} {
  if (!sub) return { remaining: PLAN_LIMITS.TRIAL.creditsMonthly, monthly: PLAN_LIMITS.TRIAL.creditsMonthly };
  return { remaining: Math.max(0, sub.creditsMonthly - sub.creditsUsed), monthly: sub.creditsMonthly };
}

function daysInMonthUtc(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Refill boundary (00:00 UTC on `resetDay`, clamped to month length) for a given year/month. */
export function refillBoundary(year: number, month: number, resetDay: number): Date {
  const y = year + Math.floor(month / 12);
  const m = ((month % 12) + 12) % 12;
  const day = Math.max(1, Math.min(Math.floor(resetDay) || 1, daysInMonthUtc(y, m)));
  return new Date(Date.UTC(y, m, day));
}

/** The first refill boundary strictly after `periodStart`. */
export function nextRefillAfter(periodStart: Date, resetDay: number): Date {
  const y = periodStart.getUTCFullYear();
  const m = periodStart.getUTCMonth();
  const thisMonth = refillBoundary(y, m, resetDay);
  return thisMonth.getTime() > periodStart.getTime() ? thisMonth : refillBoundary(y, m + 1, resetDay);
}

/**
 * If a refill boundary has passed since `periodStart`, return the most recent boundary ≤ now
 * (the new periodStart, skipping missed months); otherwise null.
 */
export function dueRefill(periodStart: Date, resetDay: number, now: Date): Date | null {
  let next = nextRefillAfter(periodStart, resetDay);
  if (next.getTime() > now.getTime()) return null;
  let latest = next;
  for (let i = 0; i < 240; i++) {
    next = nextRefillAfter(latest, resetDay);
    if (next.getTime() > now.getTime()) break;
    latest = next;
  }
  return latest;
}


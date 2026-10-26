import { readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { InsufficientCreditsError, PLAN_LIMITS } from "@postline/core";
import { computeRemaining, dueRefill, nextRefillAfter, refillBoundary, validateAmount } from "../src/credits-math";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("credit math", () => {
  it("validateAmount", () => {
    expect(validateAmount(0)).toBe(0);
    expect(validateAmount(3)).toBe(3);
    expect(() => validateAmount(-1)).toThrow();
    expect(() => validateAmount(1.5)).toThrow();
  });

  it("computeRemaining", () => {
    expect(computeRemaining({ creditsMonthly: 50, creditsUsed: 20 })).toEqual({ remaining: 30, monthly: 50 });
    expect(computeRemaining({ creditsMonthly: 50, creditsUsed: 70 })).toEqual({ remaining: 0, monthly: 50 });
    expect(computeRemaining(null)).toEqual({ remaining: PLAN_LIMITS.TRIAL.creditsMonthly, monthly: PLAN_LIMITS.TRIAL.creditsMonthly });
  });

  it("refill boundaries clamp to month length and roll years", () => {
    expect(refillBoundary(2026, 1, 31).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(refillBoundary(2026, 12, 5).toISOString()).toBe("2027-01-05T00:00:00.000Z");
    expect(nextRefillAfter(d("2026-03-01"), 1).toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(nextRefillAfter(new Date("2026-03-01T10:00:00Z"), 15).toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("dueRefill", () => {
    expect(dueRefill(d("2026-03-01"), 1, new Date("2026-03-31T23:59:00Z"))).toBeNull();
    expect(dueRefill(d("2026-03-01"), 1, d("2026-04-01"))?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    // missed several months → jump to latest boundary, single refill
    expect(dueRefill(d("2026-01-10"), 10, d("2026-05-20"))?.toISOString()).toBe("2026-05-10T00:00:00.000Z");
    // after refilling, not due again until next boundary
    expect(dueRefill(d("2026-05-10"), 10, d("2026-05-20"))).toBeNull();
  });
});

// ---------------------------------------------------------------- optional DB integration

function databaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
    return env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

async function reachable(url: string | undefined): Promise<boolean> {
  if (!url) return false;
  try {
    const u = new URL(url);
    return await new Promise<boolean>((resolve) => {
      const sock = createConnection({ host: u.hostname, port: Number(u.port || 5432) });
      const done = (ok: boolean) => {
        sock.destroy();
        resolve(ok);
      };
      sock.setTimeout(1000, () => done(false));
      sock.once("connect", () => done(true));
      sock.once("error", () => done(false));
    });
  } catch {
    return false;
  }
}

const DB_URL = databaseUrl();
const dbUp = await reachable(DB_URL);
if (dbUp && DB_URL) process.env.DATABASE_URL = DB_URL;

describe.skipIf(!dbUp)("credits (Postgres integration)", async () => {
  const { prisma } = await import("@postline/db");
  const credits = await import("../src/credits");
  const tag = `aitest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let userId = "";
  let brandId = "";

  async function setup() {
    if (userId) return;
    const user = await prisma.user.create({ data: { email: `${tag}@example.test` } });
    userId = user.id;
    const brand = await prisma.brand.create({ data: { name: tag, ownerId: userId } });
    brandId = brand.id;
  }

  afterAll(async () => {
    if (userId) {
      await prisma.creditLedger.deleteMany({ where: { userId } });
      await prisma.subscription.deleteMany({ where: { userId } });
      await prisma.brand.deleteMany({ where: { ownerId: userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it("creates a TRIAL subscription on first charge and debits the owner", async () => {
    await setup();
    const out = await credits.withCredits({ brandId, actorId: userId, reason: "caption", amount: 2 }, async () => "ok");
    expect(out).toBe("ok");
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId } });
    expect(sub.plan).toBe("TRIAL");
    expect(sub.creditsMonthly).toBe(PLAN_LIMITS.TRIAL.creditsMonthly);
    expect(sub.creditsUsed).toBe(2);
    expect(await credits.remainingCredits(brandId)).toEqual({ remaining: PLAN_LIMITS.TRIAL.creditsMonthly - 2, monthly: PLAN_LIMITS.TRIAL.creditsMonthly });
    const ledger = await prisma.creditLedger.findMany({ where: { userId } });
    expect(ledger.map((l) => [l.delta, l.reason])).toEqual([[-2, "caption"]]);
  });

  it("refunds when fn throws", async () => {
    await setup();
    const before = await credits.remainingCredits(brandId);
    await expect(
      credits.withCredits({ brandId, actorId: userId, reason: "rewrite", amount: 1 }, async () => {
        throw new Error("model down");
      }),
    ).rejects.toThrow("model down");
    expect(await credits.remainingCredits(brandId)).toEqual(before);
    const refund = await prisma.creditLedger.findFirst({ where: { userId, reason: "refund" } });
    expect(refund?.delta).toBe(1);
  });

  it("throws InsufficientCreditsError without running fn, and is atomic under concurrency", async () => {
    await setup();
    await prisma.subscription.update({ where: { userId }, data: { creditsMonthly: 5, creditsUsed: 0 } });
    let ran = 0;
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => credits.withCredits({ brandId, actorId: userId, reason: "caption", amount: 1 }, async () => ran++)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(5);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(InsufficientCreditsError);
    expect(ran).toBe(5);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { userId } })).creditsUsed).toBe(5);
  });

  it("refillCreditsIfDue resets usage once per period", async () => {
    await setup();
    await prisma.subscription.update({
      where: { userId },
      data: { creditsUsed: 4, periodStart: d("2026-01-01"), resetDay: 1 },
    });
    await credits.refillCreditsIfDue(d("2026-03-15"));
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId } });
    expect(sub.creditsUsed).toBe(0);
    expect(sub.periodStart.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    const refill = await prisma.creditLedger.findMany({ where: { userId, reason: "refill" } });
    expect(refill.map((r) => r.delta)).toEqual([4]);
    await credits.refillCreditsIfDue(d("2026-03-20"));
    expect(await prisma.creditLedger.count({ where: { userId, reason: "refill" } })).toBe(1);
  });
});

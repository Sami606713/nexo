import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@postline/db";
import { PLAN_LIMITS } from "@postline/core";
import { conflict, parseBody, route } from "@/lib/http";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const POST = route(async (req) => {
  const { name, email, password } = await parseBody(req, schema);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  if (existing?.passwordHash) throw conflict("An account with this email already exists. Sign in instead.");
  const passwordHash = await bcrypt.hash(password, 10);
  // A user created earlier via magic link (no password) can set one here.
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, name } })
    : await prisma.user.create({ data: { name, email, passwordHash } });
  await prisma.subscription.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, plan: "TRIAL", status: "trialing", creditsMonthly: PLAN_LIMITS.TRIAL.creditsMonthly },
  });
  return { ok: true, userId: user.id };
});

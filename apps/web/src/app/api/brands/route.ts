import { prisma } from "@postline/db";
import { brandInput } from "@postline/core";
import { parseBody, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { ensureSubscription } from "@/lib/billing";

export const GET = route(async () => {
  const user = await requireUser();
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { brand: { select: { id: true, name: true, timezone: true, website: true } } },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({ ...m.brand, role: m.role }));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, brandInput);
  await ensureSubscription(user.id);
  const brand = await prisma.brand.create({
    data: {
      ownerId: user.id,
      name: input.name,
      website: input.website ?? null,
      description: input.description ?? null,
      voice: input.voice ?? null,
      audience: input.audience ?? null,
      avoid: input.avoid ?? null,
      timezone: input.timezone || "UTC",
      weekStart: input.weekStart ?? 1,
      colors: input.colors ?? [],
      logos: input.logos ?? [],
      memberships: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  return brand;
});

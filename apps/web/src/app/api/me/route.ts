import { prisma } from "@postline/db";
import { route } from "@/lib/http";
import { requireUser } from "@/lib/session";

export const GET = route(async () => {
  const user = await requireUser();
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { brand: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return {
    user: { id: user.id, name: user.name, email: user.email, image: user.image },
    brands: memberships.map((m) => ({ id: m.brand.id, name: m.brand.name, role: m.role })),
  };
});

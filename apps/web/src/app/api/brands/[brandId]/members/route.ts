import { prisma } from "@postline/db";
import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";

type Ctx = { params: Promise<{ brandId: string }> };

/** Members of the brand: [{ id (membershipId), role, createdAt, user: { id, name, email, image } }]. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId);
  const rows = await prisma.membership.findMany({
    where: { brandId },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: { createdAt: "asc" },
  });
  const order = { OWNER: 0, ADMIN: 1, MANAGER: 2, CLIENT: 3 } as const;
  return rows
    .map((m) => ({ id: m.id, role: m.role, createdAt: m.createdAt, user: m.user }))
    .sort((a, b) => order[a.role] - order[b.role]);
});

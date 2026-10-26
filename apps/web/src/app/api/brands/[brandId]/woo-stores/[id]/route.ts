import { prisma } from "@postline/db";
import { notFound, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";

type Ctx = { params: Promise<{ brandId: string; id: string }> };

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId, "posts.write");
  const store = await prisma.wooStore.findFirst({ where: { id, brandId } });
  if (!store) throw notFound("Store not found");
  await prisma.wooStore.delete({ where: { id } });
  return { ok: true };
});

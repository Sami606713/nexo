import { Prisma, prisma } from "@postline/db";
import { conflict, notFound, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { labelSchema } from "@/lib/platform-schemas";

type Ctx = { params: Promise<{ brandId: string; id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId, "settings.other");
  const data = await parseBody(req, labelSchema.partial());
  const found = await prisma.label.findFirst({ where: { id, brandId }, select: { id: true } });
  if (!found) throw notFound("Label not found");
  try {
    return await prisma.label.update({ where: { id }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("A label with this name already exists");
    throw e;
  }
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId, "settings.other");
  await prisma.label.deleteMany({ where: { id, brandId } });
  return { ok: true };
});

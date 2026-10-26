import { Prisma, prisma } from "@postline/db";
import { conflict, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { labelSchema } from "@/lib/platform-schemas";

type Ctx = { params: Promise<{ brandId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId);
  return prisma.label.findMany({ where: { brandId }, orderBy: { name: "asc" } });
});

export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId, "settings.other");
  const data = await parseBody(req, labelSchema);
  try {
    return await prisma.label.create({ data: { ...data, brandId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("A label with this name already exists");
    throw e;
  }
});

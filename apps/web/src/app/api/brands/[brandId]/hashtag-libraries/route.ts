import { prisma } from "@postline/db";
import { parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { hashtagLibrarySchema } from "@/lib/platform-schemas";

type Ctx = { params: Promise<{ brandId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId);
  return prisma.hashtagLibrary.findMany({ where: { brandId }, orderBy: { name: "asc" } });
});

export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId, "settings.other");
  const data = await parseBody(req, hashtagLibrarySchema);
  return prisma.hashtagLibrary.create({ data: { ...data, brandId } });
});

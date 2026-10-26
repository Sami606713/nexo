import { Prisma, prisma } from "@postline/db";
import { conflict, notFound, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { pageSchema, pageSelect, slugAvailable } from "../_schema";

type Ctx = { params: Promise<{ brandId: string; pageId: string }> };

async function load(brandId: string, pageId: string) {
  const page = await prisma.bioPage.findFirst({ where: { id: pageId, brandId }, select: pageSelect });
  if (!page) throw notFound("Bio page not found");
  return page;
}

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId, pageId } = await params;
  await requireBrand(brandId);
  return load(brandId, pageId);
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { brandId, pageId } = await params;
  await requireBrand(brandId, "posts.write");
  await load(brandId, pageId);
  const body = await parseBody(req, pageSchema.partial());
  if (body.slug && !(await slugAvailable(body.slug, pageId))) throw conflict("That address is already taken");
  const { theme, blocks, ...rest } = body;
  try {
    return await prisma.bioPage.update({
      where: { id: pageId },
      data: {
        ...rest,
        ...(theme ? { theme: theme as unknown as Prisma.InputJsonValue } : {}),
        ...(blocks ? { blocks: blocks as unknown as Prisma.InputJsonValue } : {}),
      },
      select: pageSelect,
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw conflict("That address is already taken");
    throw e;
  }
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { brandId, pageId } = await params;
  await requireBrand(brandId, "posts.write");
  await load(brandId, pageId);
  await prisma.bioPage.delete({ where: { id: pageId } });
  return { ok: true };
});

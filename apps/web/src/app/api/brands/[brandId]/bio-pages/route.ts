import { Prisma, prisma } from "@postline/db";
import { conflict, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { DEFAULT_THEME } from "@/components/bio/types";
import { pageSchema, pageSelect, slugAvailable } from "./_schema";

type Ctx = { params: Promise<{ brandId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId);
  const pages = await prisma.bioPage.findMany({ where: { brandId }, select: pageSelect, orderBy: { createdAt: "asc" } });
  const since = new Date(Date.now() - 30 * 24 * 3600_000);
  const counts = pages.length
    ? await prisma.bioPageEvent.groupBy({
        by: ["pageId", "kind"],
        where: { pageId: { in: pages.map((p) => p.id) }, createdAt: { gte: since } },
        _count: { _all: true },
      })
    : [];
  return pages.map((p) => ({
    ...p,
    stats: {
      views: counts.find((c) => c.pageId === p.id && c.kind === "view")?._count._all ?? 0,
      clicks: counts.find((c) => c.pageId === p.id && c.kind === "click")?._count._all ?? 0,
    },
  }));
});

const createSchema = pageSchema.partial().required({ slug: true, title: true });

export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const { brand } = await requireBrand(brandId, "posts.write");
  const body = await parseBody(req, createSchema);
  if (!(await slugAvailable(body.slug))) throw conflict("That address is already taken");
  const logo = Array.isArray(brand.logos) ? (brand.logos as { url?: string }[])[0]?.url : undefined;
  try {
    return await prisma.bioPage.create({
      data: {
        brandId,
        slug: body.slug,
        title: body.title,
        bio: body.bio ?? brand.description?.slice(0, 160) ?? null,
        avatarUrl: body.avatarUrl ?? logo ?? null,
        theme: (body.theme ?? DEFAULT_THEME) as unknown as Prisma.InputJsonValue,
        blocks: (body.blocks ?? [
          { id: crypto.randomUUID().slice(0, 8), type: "link", label: "Visit our website", url: brand.website ?? "https://" },
        ]) as unknown as Prisma.InputJsonValue,
        published: body.published ?? false,
      },
      select: pageSelect,
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw conflict("That address is already taken");
    throw e;
  }
});

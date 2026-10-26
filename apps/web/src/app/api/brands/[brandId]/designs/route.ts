import { z } from "zod";
import { prisma, type Prisma } from "@postline/db";
import { badRequest, route } from "@/lib/http";
import { readBody } from "@/lib/posts/body";
import { requireBrand } from "@/lib/session";
import { emptyScene, formatByKey, resizeScene, type Scene } from "@/components/studio/scene";
import { sceneSchema } from "@/components/studio/scene-schema";
import { instantiateTemplate, templateById } from "@/components/studio/templates";
import { toDesignDTO } from "@/components/studio/server";

type Ctx = { params: Promise<{ brandId: string }> };

export const runtime = "nodejs";

/** GET ?q=&cursor=&limit= → { items, nextCursor } (most recently edited first). */
export const GET = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId);
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(60, Math.max(1, Number(sp.get("limit") ?? 24) || 24));
  const cursor = sp.get("cursor");
  const q = sp.get("q")?.trim();
  const rows = await prisma.design.findMany({
    where: { brandId: access.brand.id, isTemplate: false, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items: items.map((d) => toDesignDTO(d)), nextCursor: hasMore ? items[items.length - 1]!.id : null };
});

const createInput = z.object({
  name: z.string().trim().max(120).optional(),
  format: z.string().trim().min(1).max(40).default("custom"),
  width: z.number().int().min(50).max(8000).optional(),
  height: z.number().int().min(50).max(8000).optional(),
  doc: sceneSchema.optional(),
  templateId: z.string().max(80).optional(),
  useBrandColors: z.boolean().optional(),
});

/** POST { name?, format, width?, height?, doc?, templateId?, useBrandColors? } → design (with doc). */
export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const input = await readBody(req, createInput);
  const fmt = formatByKey(input.format);
  let width = input.width ?? fmt?.width;
  let height = input.height ?? fmt?.height;

  let doc: Scene;
  let defaultName = fmt ? `Untitled ${fmt.label}` : "Untitled design";
  if (input.doc) {
    doc = input.doc as Scene;
  } else if (input.templateId) {
    const t = templateById(input.templateId);
    if (!t) throw badRequest("Unknown template");
    const colors = input.useBrandColors ? (access.brand.colors as unknown as string[]) : null;
    doc = instantiateTemplate(t, Array.isArray(colors) ? colors.filter((c) => typeof c === "string") : null);
    defaultName = t.name;
    width ??= t.scene.width;
    height ??= t.scene.height;
  } else {
    if (!width || !height) throw badRequest("Pick a format or enter a custom size");
    doc = emptyScene(width, height);
  }
  width ??= doc.width;
  height ??= doc.height;
  if (doc.width !== width || doc.height !== height) doc = resizeScene(doc, width, height);

  const design = await prisma.design.create({
    data: {
      brandId: access.brand.id,
      name: input.name || defaultName,
      format: fmt ? fmt.key : input.format,
      width,
      height,
      doc: doc as unknown as Prisma.InputJsonValue,
    },
  });
  return toDesignDTO(design, true);
});

import { prisma, type Prisma } from "@postline/db";
import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { loadDesign, toDesignDTO } from "@/components/studio/server";

type Ctx = { params: Promise<{ brandId: string; designId: string }> };

export const POST = route<Ctx>(async (_req, { params }) => {
  const { brandId, designId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const src = await loadDesign(access.brand.id, designId);
  const copy = await prisma.design.create({
    data: {
      brandId: access.brand.id,
      name: `${src.name} (copy)`.slice(0, 120),
      format: src.format,
      width: src.width,
      height: src.height,
      doc: src.doc as Prisma.InputJsonValue,
      // Thumbnails are keyed by design id; the copy reuses the source image until its first save.
      previewUrl: src.previewUrl,
    },
  });
  return toDesignDTO(copy);
});

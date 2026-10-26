import { notFound } from "next/navigation";
import { prisma } from "@postline/db";
import { requireBrand } from "@/lib/session";
import { StudioLoader } from "@/components/studio/StudioLoader";
import { brandAssets } from "@/components/studio/brand-assets";
import { safeParseScene } from "@/components/studio/scene-schema";
import { emptyScene } from "@/components/studio/scene";

export const metadata = { title: "Studio" };

export default async function StudioDesignPage({ params }: { params: Promise<{ brandId: string; designId: string }> }) {
  const { brandId, designId } = await params;
  const { brand } = await requireBrand(brandId, "posts.write");
  const d = await prisma.design.findFirst({ where: { id: designId, brandId: brand.id, isTemplate: false } });
  if (!d) notFound();
  const doc = safeParseScene(d.doc) ?? emptyScene(d.width, d.height);
  return <StudioLoader brandId={brand.id} design={{ id: d.id, name: d.name, format: d.format, doc }} brand={brandAssets(brand)} />;
}

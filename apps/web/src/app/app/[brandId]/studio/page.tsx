import { requireBrand } from "@/lib/session";
import { can } from "@postline/core";
import { StudioHome } from "@/components/studio/StudioHome";
import { brandAssets } from "@/components/studio/brand-assets";

export const metadata = { title: "Studio" };

export default async function StudioPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const { brand, membership } = await requireBrand(brandId);
  return <StudioHome brandId={brand.id} brandColors={brandAssets(brand).colors} canEdit={can(membership.role, "posts.write")} />;
}

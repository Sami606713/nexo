import type { Metadata } from "next";
import { requireBrand } from "@/lib/session";
import { BrandProfileForm } from "@/components/brand/BrandProfileForm";

export const metadata: Metadata = { title: "Brand profile" };

export default async function BrandPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const { brand } = await requireBrand(brandId);
  const colors = Array.isArray(brand.colors) ? brand.colors.filter((c): c is string => typeof c === "string") : [];
  const logos = Array.isArray(brand.logos)
    ? brand.logos.flatMap((l) => (l && typeof l === "object" && "url" in l && typeof l.url === "string" ? [l.url] : typeof l === "string" ? [l] : []))
    : [];
  return (
    <BrandProfileForm
      key={brand.updatedAt.toISOString()}
      initial={{
        name: brand.name,
        website: brand.website ?? "",
        description: brand.description ?? "",
        voice: brand.voice ?? "",
        audience: brand.audience ?? "",
        avoid: brand.avoid ?? "",
        colors,
        logos,
        timezone: brand.timezone,
        weekStart: String(brand.weekStart),
      }}
    />
  );
}

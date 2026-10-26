import type { Metadata } from "next";
import { requireBrand } from "@/lib/session";
import { BioPagesList } from "@/components/bio/BioPagesList";

export const metadata: Metadata = { title: "Bio pages" };

export default async function BioPagesPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  await requireBrand(brandId);
  return <BioPagesList />;
}

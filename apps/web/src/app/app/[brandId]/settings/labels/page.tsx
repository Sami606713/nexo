import type { Metadata } from "next";
import { requireBrand } from "@/lib/session";
import { LabelsSettings } from "@/components/settings/LabelsSettings";

export const metadata: Metadata = { title: "Labels" };

export default async function Page({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  await requireBrand(brandId);
  return <LabelsSettings />;
}

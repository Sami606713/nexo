import type { Metadata } from "next";
import { requireBrand } from "@/lib/session";
import { TeamSettings } from "@/components/team/TeamSettings";

export const metadata: Metadata = { title: "Team" };

export default async function Page({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  await requireBrand(brandId);
  return <TeamSettings />;
}

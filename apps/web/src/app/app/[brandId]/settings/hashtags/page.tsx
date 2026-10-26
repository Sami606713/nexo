import type { Metadata } from "next";
import { requireBrand } from "@/lib/session";
import { HashtagsSettings } from "@/components/settings/HashtagsSettings";

export const metadata: Metadata = { title: "Hashtags" };

export default async function Page({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  await requireBrand(brandId);
  return <HashtagsSettings />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@postline/db";
import { requireBrand } from "@/lib/session";
import { BioEditor } from "@/components/bio/BioEditor";

export const metadata: Metadata = { title: "Edit bio page" };

export default async function BioEditorPage({ params }: { params: Promise<{ brandId: string; pageId: string }> }) {
  const { brandId, pageId } = await params;
  await requireBrand(brandId);
  const exists = await prisma.bioPage.findFirst({ where: { id: pageId, brandId }, select: { id: true } });
  if (!exists) notFound();
  return <BioEditor pageId={pageId} />;
}

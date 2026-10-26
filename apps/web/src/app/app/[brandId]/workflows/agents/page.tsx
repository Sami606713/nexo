import type { Metadata } from "next";
import { requireBrand } from "@/lib/session";
import { AgentsManager } from "@/components/workflows/AgentsManager";

export const metadata: Metadata = { title: "AI agents" };

export default async function Page({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  await requireBrand(brandId);
  return <AgentsManager />;
}

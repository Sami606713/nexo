import type { Metadata } from "next";
import { requireBrand } from "@/lib/session";
import { WorkflowsList } from "@/components/workflows/WorkflowsList";

export const metadata: Metadata = { title: "Workflows" };

export default async function Page({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  await requireBrand(brandId);
  return <WorkflowsList />;
}

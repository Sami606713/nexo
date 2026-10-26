import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@postline/db";
import { requireBrand } from "@/lib/session";
import { WorkflowBuilder } from "@/components/workflows/WorkflowBuilder";

export const metadata: Metadata = { title: "Workflow" };

export default async function Page({ params }: { params: Promise<{ brandId: string; id: string }> }) {
  const { brandId, id } = await params;
  await requireBrand(brandId);
  const wf = await prisma.workflow.findFirst({ where: { id, brandId }, select: { id: true } });
  if (!wf) notFound();
  return <WorkflowBuilder workflowId={id} />;
}

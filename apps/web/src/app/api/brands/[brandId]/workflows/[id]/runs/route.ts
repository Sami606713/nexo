import { prisma } from "@postline/db";
import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { loadWorkflow, toRunDTO } from "@/lib/workflows/server";

type Ctx = { params: Promise<{ brandId: string; id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId);
  await loadWorkflow(brandId, id);
  const url = new URL(req.url);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const [total, rows] = await Promise.all([
    prisma.workflowRun.count({ where: { workflowId: id } }),
    prisma.workflowRun.findMany({ where: { workflowId: id }, orderBy: { startedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { items: rows.map(toRunDTO), total, page, pageSize };
});

import { z } from "zod";
import { prisma } from "@postline/db";
import { parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { json, loadWorkflow, toWorkflowDTO, validateAgainstBrand } from "@/lib/workflows/server";
import type { WorkflowStep, WorkflowTrigger } from "@/lib/workflows/types";

type Ctx = { params: Promise<{ brandId: string; id: string }> };

/** Body {active?: boolean} (default: flip). Activation requires a fully configured workflow. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId, "posts.write");
  const wf = await loadWorkflow(brandId, id);
  const body = await parseBody(req, z.object({ active: z.boolean().optional() }).default({})).catch(() => ({ active: undefined }));
  const next = body?.active ?? !wf.active;
  if (next) {
    const errors = await validateAgainstBrand(brandId, wf.trigger as unknown as WorkflowTrigger, wf.steps as unknown as WorkflowStep[]);
    if (!errors.ok) {
      return Response.json({ error: "Finish setting up the highlighted steps before turning this workflow on.", errors }, { status: 400 });
    }
  }
  // Re-arm schedule bookkeeping on activation so an interval starts counting from now.
  const state = { ...((wf.state ?? {}) as Record<string, unknown>) };
  if (next && !wf.active) delete state.schedule;
  const updated = await prisma.workflow.update({ where: { id }, data: { active: next, state: json(state) } });
  return { workflow: toWorkflowDTO(updated) };
});

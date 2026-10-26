import { prisma } from "@postline/db";
import { parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { json, loadWorkflow, stateAfterTriggerChange, toWorkflowDTO, validateAgainstBrand, workflowPatchSchema } from "@/lib/workflows/server";
import type { WorkflowStep, WorkflowTrigger } from "@/lib/workflows/types";

type Ctx = { params: Promise<{ brandId: string; id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId);
  return toWorkflowDTO(await loadWorkflow(brandId, id));
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId, "posts.write");
  const wf = await loadWorkflow(brandId, id);
  const body = await parseBody(req, workflowPatchSchema);
  const trigger = (body.trigger ?? wf.trigger) as WorkflowTrigger;
  const steps = (body.steps ?? wf.steps) as WorkflowStep[];
  const state = body.trigger ? stateAfterTriggerChange(wf.trigger as unknown as WorkflowTrigger, body.trigger as WorkflowTrigger, (wf.state ?? {}) as Record<string, unknown>) : undefined;

  // An active workflow must stay valid; otherwise it's switched off and the errors are returned.
  let active = wf.active;
  const errors = await validateAgainstBrand(brandId, trigger, steps);
  if (active && !errors.ok) active = false;

  const updated = await prisma.workflow.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.trigger ? { trigger: json(body.trigger) } : {}),
      ...(body.steps ? { steps: json(body.steps) } : {}),
      ...(body.layout ? { layout: json(body.layout) } : {}),
      ...(state ? { state: json(state) } : {}),
      active,
    },
  });
  return { workflow: toWorkflowDTO(updated), errors, deactivated: wf.active && !active };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId, "posts.write");
  await loadWorkflow(brandId, id);
  await prisma.workflow.delete({ where: { id } });
  return { ok: true };
});

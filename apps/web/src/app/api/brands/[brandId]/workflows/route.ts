import { z } from "zod";
import { prisma } from "@postline/db";
import { badRequest, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { findTemplate } from "@/lib/workflows/templates";
import { json } from "@/lib/workflows/server";
import type { RunStatus, StepType, WorkflowListItemDTO, WorkflowStep, WorkflowTrigger } from "@/lib/workflows/types";

type Ctx = { params: Promise<{ brandId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId);
  const rows = await prisma.workflow.findMany({
    where: { brandId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { runs: true } },
      runs: { orderBy: { startedAt: "desc" }, take: 1, select: { status: true, startedAt: true } },
    },
  });
  return rows.map((w): WorkflowListItemDTO => {
    const steps = (w.steps as unknown as WorkflowStep[]) ?? [];
    const last = w.runs[0];
    return {
      id: w.id,
      name: w.name,
      active: w.active,
      trigger: w.trigger as unknown as WorkflowTrigger,
      stepCount: steps.length,
      stepTypes: steps.map((s) => s.type as StepType),
      lastRunAt: w.lastRunAt?.toISOString() ?? null,
      lastRun: last ? { status: last.status as RunStatus, startedAt: last.startedAt.toISOString() } : null,
      runCount: w._count.runs,
      createdAt: w.createdAt.toISOString(),
    };
  });
});

const createSchema = z.object({ template: z.string().default("blank"), name: z.string().trim().max(120).optional() });

export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId, "posts.write");
  const body = await parseBody(req, createSchema);
  const tpl = findTemplate(body.template ?? "blank");
  if (!tpl) throw badRequest("Unknown template");

  let agentId: string | null = null;
  if (tpl.agent) {
    const existing = await prisma.aIAgent.findFirst({ where: { brandId, name: tpl.agent.name } });
    agentId = existing?.id ?? (await prisma.aIAgent.create({ data: { brandId, name: tpl.agent.name, prompt: tpl.agent.prompt, model: "default" } })).id;
  }
  // Default channels: every channel of the brand for post steps (user can narrow it down).
  const channels = await prisma.channel.findMany({ where: { brandId }, select: { id: true }, orderBy: { createdAt: "asc" } });
  const steps = tpl.steps.map((s) => {
    const config = { ...s.config };
    if (s.type === "ai_agent" && config.agentId === "@starter") config.agentId = agentId ?? "";
    if (s.type === "create_post") config.channelIds = channels.map((c) => c.id);
    return { ...s, config };
  });
  const trigger = { ...tpl.trigger, config: { ...tpl.trigger.config } };
  if (trigger.type === "new_comment") {
    const inbox = await prisma.channel.findFirst({ where: { brandId, inboxEnabled: true }, select: { id: true } });
    if (inbox) trigger.config.channelId = inbox.id;
  }
  if (trigger.type === "woo_product") {
    const store = await prisma.wooStore.findFirst({ where: { brandId }, select: { id: true } });
    if (store) trigger.config.storeId = store.id;
  }
  const wf = await prisma.workflow.create({
    data: { brandId, name: body.name || (tpl.key === "blank" ? "Untitled workflow" : tpl.title), trigger: json(trigger), steps: json(steps) },
  });
  return { id: wf.id };
});

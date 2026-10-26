import "server-only";
import { z } from "zod";
import { prisma, type AIAgent, type Prisma, type Workflow, type WorkflowRun } from "@postline/db";
import { notFound } from "@/lib/http";
import {
  STEP_TYPES,
  TRIGGER_TYPES,
  type AIAgentDTO,
  type RunLogEntry,
  type RunStatus,
  type WorkflowDTO,
  type WorkflowRunDTO,
  type WorkflowStep,
  type WorkflowTrigger,
} from "./types";
import { validateWorkflow, type WorkflowErrors } from "./validate";

export const json = (v: unknown) => v as Prisma.InputJsonValue;

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export const webhookUrl = (secret: string) => `${appUrl()}/api/hooks/wf/${secret}`;

const configSchema = z.record(z.unknown()).default({});
export const triggerSchema = z.object({ type: z.enum(TRIGGER_TYPES), config: configSchema });
export const stepSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/, "Invalid step id"),
  type: z.enum(STEP_TYPES),
  config: configSchema,
});
export const workflowPatchSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120).optional(),
  trigger: triggerSchema.optional(),
  steps: z
    .array(stepSchema)
    .max(30, "A workflow can have at most 30 actions")
    .refine((a) => new Set(a.map((s) => s.id)).size === a.length, "Step ids must be unique")
    .optional(),
  layout: z.record(z.unknown()).optional(),
});

export function toWorkflowDTO(w: Workflow): WorkflowDTO {
  const state = (w.state ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const pick = (s?: Record<string, unknown>) =>
    s ? { lastPolledAt: s.lastPolledAt as string | undefined, lastError: (s.lastError as string | null) ?? null, initialized: !!s.initialized } : undefined;
  return {
    id: w.id,
    name: w.name,
    active: w.active,
    trigger: w.trigger as unknown as WorkflowTrigger,
    steps: (w.steps as unknown as WorkflowStep[]) ?? [],
    layout: (w.layout as Record<string, unknown>) ?? {},
    webhookUrl: webhookUrl(w.webhookSecret),
    state: { rss: pick(state.rss), woo: pick(state.woo) },
    lastRunAt: w.lastRunAt?.toISOString() ?? null,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

export function toRunDTO(r: WorkflowRun): WorkflowRunDTO {
  return {
    id: r.id,
    status: r.status as RunStatus,
    input: (r.input as Record<string, unknown>) ?? {},
    log: (r.log as unknown as RunLogEntry[]) ?? [],
    error: r.error,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  };
}

export function toAgentDTO(a: AIAgent): AIAgentDTO {
  return { ...a, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() };
}

export async function loadWorkflow(brandId: string, id: string) {
  const w = await prisma.workflow.findFirst({ where: { id, brandId } });
  if (!w) throw notFound("Workflow not found");
  return w;
}

export async function validateAgainstBrand(brandId: string, trigger: WorkflowTrigger, steps: WorkflowStep[]): Promise<WorkflowErrors> {
  const [agents, channels, stores] = await Promise.all([
    prisma.aIAgent.findMany({ where: { brandId }, select: { id: true } }),
    prisma.channel.findMany({ where: { brandId }, select: { id: true } }),
    prisma.wooStore.findMany({ where: { brandId }, select: { id: true } }),
  ]);
  return validateWorkflow(trigger, steps, {
    agentIds: new Set(agents.map((a) => a.id)),
    channelIds: new Set(channels.map((c) => c.id)),
    storeIds: new Set(stores.map((s) => s.id)),
  });
}

/** Trigger bookkeeping must restart when the watched source changes. */
export function stateAfterTriggerChange(prev: WorkflowTrigger | null, next: WorkflowTrigger, state: Record<string, unknown>) {
  const same = (k: string) => prev?.type === next.type && String(prev?.config?.[k] ?? "") === String(next.config?.[k] ?? "");
  const out = { ...state };
  if (!(next.type === "rss" && same("url"))) delete out.rss;
  if (!(next.type === "woo_product" && same("storeId"))) delete out.woo;
  if (!(next.type === "schedule" && same("mode") && same("every") && same("unit") && same("time"))) delete out.schedule;
  return out;
}

export const agentSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  prompt: z.string().trim().min(1, "Write the agent's instructions").max(8000),
  model: z.string().trim().max(80).optional(),
  imageGen: z.boolean().optional(),
  webSearch: z.boolean().optional(),
});

export const CLAUDE_AGENT_MODELS = [
  { value: "claude-sonnet-5-5", label: "Claude Sonnet — balanced" },
  { value: "claude-opus-5-5", label: "Claude Opus — highest quality" },
  { value: "claude-haiku-5-5", label: "Claude Haiku — fastest" },
];
/** "default" resolves to the configured text model at run time (see agentModel()). */
export const AGENT_MODELS = ["default", ...CLAUDE_AGENT_MODELS.map((m) => m.value)];

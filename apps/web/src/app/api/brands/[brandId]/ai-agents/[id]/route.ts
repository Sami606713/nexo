import { prisma } from "@postline/db";
import { notFound, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { AGENT_MODELS, agentSchema, toAgentDTO } from "@/lib/workflows/server";

type Ctx = { params: Promise<{ brandId: string; id: string }> };

async function load(brandId: string, id: string) {
  const a = await prisma.aIAgent.findFirst({ where: { id, brandId } });
  if (!a) throw notFound("Agent not found");
  return a;
}

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId);
  return toAgentDTO(await load(brandId, id));
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId, "posts.write");
  await load(brandId, id);
  const data = await parseBody(req, agentSchema.partial());
  const a = await prisma.aIAgent.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.prompt !== undefined ? { prompt: data.prompt } : {}),
      ...(data.model && AGENT_MODELS.includes(data.model) ? { model: data.model } : {}),
      ...(data.imageGen !== undefined ? { imageGen: data.imageGen } : {}),
      ...(data.webSearch !== undefined ? { webSearch: data.webSearch } : {}),
    },
  });
  return toAgentDTO(a);
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId, "posts.write");
  await load(brandId, id);
  await prisma.aIAgent.delete({ where: { id } });
  return { ok: true };
});

import { prisma } from "@postline/db";
import { parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { AGENT_MODELS, agentSchema, toAgentDTO } from "@/lib/workflows/server";

type Ctx = { params: Promise<{ brandId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId);
  const rows = await prisma.aIAgent.findMany({ where: { brandId }, orderBy: { createdAt: "asc" } });
  return rows.map(toAgentDTO);
});

export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId, "posts.write");
  const data = await parseBody(req, agentSchema);
  const model = data.model && AGENT_MODELS.includes(data.model) ? data.model : "default";
  const a = await prisma.aIAgent.create({
    data: { brandId, name: data.name, prompt: data.prompt, model, imageGen: !!data.imageGen, webSearch: !!data.webSearch },
  });
  return toAgentDTO(a);
});

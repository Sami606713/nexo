import { z } from "zod";
import { prisma } from "@postline/db";
import { withCredits } from "@postline/ai";
import { notFound, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { runAgent } from "@/lib/workflows/agent";
import { enforceRateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ brandId: string; id: string }> };

/** Try an agent on a sample input. Costs 1 credit (refunded if the call fails). */
export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId, id } = await params;
  const { user, brand } = await requireBrand(brandId, "posts.write");
  await enforceRateLimit("ai", user.id);
  const agent = await prisma.aIAgent.findFirst({ where: { id, brandId } });
  if (!agent) throw notFound("Agent not found");
  const { input } = await parseBody(req, z.object({ input: z.string().trim().min(1, "Enter some test input").max(8000) }));
  const res = await withCredits({ brandId, actorId: user.id, reason: "workflow_run", amount: 1, refType: "AIAgent", refId: id }, () =>
    runAgent(agent, brand, input),
  );
  return res;
});

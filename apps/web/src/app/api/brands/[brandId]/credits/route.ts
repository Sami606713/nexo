import { remainingCredits } from "@postline/ai";
import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { ownerPlan } from "@/lib/billing";

type Ctx = { params: Promise<{ brandId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId);
  const [credits, { plan, limits }] = await Promise.all([remainingCredits(brandId), ownerPlan(brandId)]);
  return { remaining: credits.remaining, monthly: credits.monthly, plan, planLabel: limits.label };
});

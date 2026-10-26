import { ai, brandContext, withCredits } from "@postline/ai";
import { CREDIT_COST } from "@postline/core";
import { route } from "@/lib/http";
import { readBody } from "@/lib/posts/body";
import { requireBrand } from "@/lib/session";
import { aiRewriteInput } from "@/lib/posts/ai-inputs";

type Ctx = { params: Promise<{ brandId: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const input = await readBody(req, aiRewriteInput);
  const text = await withCredits(
    { brandId: access.brand.id, actorId: access.user.id, reason: "rewrite", amount: CREDIT_COST.rewrite },
    () => ai.rewrite(brandContext(access.brand), input),
  );
  return { text };
});

import { ai, brandContext, withCredits } from "@postline/ai";
import { CREDIT_COST } from "@postline/core";
import { route } from "@/lib/http";
import { readBody } from "@/lib/posts/body";
import { requireBrand } from "@/lib/session";
import { aiScoreFixInput } from "@/lib/posts/ai-inputs";
import { brandChannels } from "@/lib/posts/ai-helpers";

type Ctx = { params: Promise<{ brandId: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const input = await readBody(req, aiScoreFixInput);
  const { networks } = await brandChannels(access.brand.id, input.channelIds);
  const caption = await withCredits(
    { brandId: access.brand.id, actorId: access.user.id, reason: "score_fix", amount: CREDIT_COST.score_fix },
    () => ai.fixScoreCheck(brandContext(access.brand), input.caption, input.checkId, networks),
  );
  return { caption };
});

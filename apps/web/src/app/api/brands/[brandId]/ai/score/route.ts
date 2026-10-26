import { ai, withCredits } from "@postline/ai";
import { scorePostHeuristic } from "@postline/ai/score";
import { route } from "@/lib/http";
import { readBody } from "@/lib/posts/body";
import { requireBrand } from "@/lib/session";
import { aiScoreInput } from "@/lib/posts/ai-inputs";
import { brandChannels } from "@/lib/posts/ai-helpers";

type Ctx = { params: Promise<{ brandId: string }> };

/** Free heuristic score; `useLlm: true` adds model-graded checks for 1 credit. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId);
  const input = await readBody(req, aiScoreInput);
  const { networks } = await brandChannels(access.brand.id, input.channelIds);
  const scoreInput = { caption: input.caption, networks, mediaCount: input.mediaCount };
  if (!input.useLlm) return scorePostHeuristic(scoreInput);
  // LLM scoring is a paid write-ish action — require write access.
  await requireBrand(brandId, "posts.write");
  return withCredits(
    { brandId: access.brand.id, actorId: access.user.id, reason: "score_fix", amount: 1 },
    () => ai.scorePost(scoreInput, { useLlm: true }),
  );
});

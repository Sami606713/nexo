import { ai, brandContext, withCredits } from "@postline/ai";
import { CREDIT_COST } from "@postline/core";
import { route } from "@/lib/http";
import { readBody } from "@/lib/posts/body";
import { requireBrand } from "@/lib/session";
import { aiHashtagsInput } from "@/lib/posts/ai-inputs";
import { brandChannels } from "@/lib/posts/ai-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ brandId: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  await enforceRateLimit("ai", access.user.id);
  const input = await readBody(req, aiHashtagsInput);
  const { networks } = await brandChannels(access.brand.id, input.channelIds);
  const hashtags = await withCredits(
    { brandId: access.brand.id, actorId: access.user.id, reason: "hashtags", amount: CREDIT_COST.hashtags },
    () => ai.generateHashtags(brandContext(access.brand), input.caption, networks, input.count),
  );
  return { hashtags: hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)) };
});

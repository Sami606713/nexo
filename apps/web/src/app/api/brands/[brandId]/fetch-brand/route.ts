import { z } from "zod";
import { ai, withCredits } from "@postline/ai";
import { badRequest, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { enforceRateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ brandId: string }> };

const schema = z.object({ website: z.string().url().optional() });

export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const { user, brand } = await requireBrand(brandId, "brand.settings");
  await enforceRateLimit("ai", user.id);
  const { website } = await parseBody(req, schema);
  const url = website ?? brand.website;
  if (!url) throw badRequest("Add your website URL first");
  const result = await withCredits({ brandId, actorId: user.id, reason: "brand_fetch", amount: 1, refType: "brand", refId: brandId }, () =>
    ai.fetchBrand(url),
  );
  return result;
});

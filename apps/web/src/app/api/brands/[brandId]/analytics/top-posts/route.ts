import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { parseRange, publishedPosts } from "../_lib/query";

type Ctx = { params: Promise<{ brandId: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId, "analytics.view");
  const range = parseRange(req);
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") ?? 20) || 20));
  const sort = sp.get("sort") === "impressions" ? "impressions" : sp.get("sort") === "er" ? "er" : "engagement";
  const posts = (await publishedPosts(brandId, range)).map((p) => ({
    ...p,
    caption: p.caption.length > 160 ? `${p.caption.slice(0, 157).trimEnd()}…` : p.caption,
    engagementRate: p.impressions > 0 ? p.engagement / p.impressions : 0,
  }));
  posts.sort((a, b) =>
    sort === "impressions" ? b.impressions - a.impressions : sort === "er" ? b.engagementRate - a.engagementRate : b.engagement - a.engagement,
  );
  return { total: posts.length, posts: posts.slice(0, limit) };
});

import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { parseRange, previousRange, totals, type Totals } from "../_lib/query";

type Ctx = { params: Promise<{ brandId: string }> };

const pct = (cur: number, prev: number): number | null => (prev === 0 ? (cur === 0 ? 0 : null) : (cur - prev) / Math.abs(prev));

export const GET = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId, "analytics.view");
  const range = parseRange(req);
  const [current, previous] = await Promise.all([totals(brandId, range), totals(brandId, previousRange(range))]);
  const change = Object.fromEntries(
    (Object.keys(current) as (keyof Totals)[]).map((k) => [k, pct(current[k], previous[k])]),
  ) as Record<keyof Totals, number | null>;
  return { from: range.from, to: range.to, current, previous, change };
});

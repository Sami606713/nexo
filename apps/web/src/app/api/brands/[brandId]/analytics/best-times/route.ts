import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { parseRange, publishedPosts, zonedWeekdayHour } from "../_lib/query";

type Ctx = { params: Promise<{ brandId: string }> };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;

/** Sensible defaults when there's not enough history yet (weekday, hour in brand time zone). */
const DEFAULT_SLOTS: [number, number][] = [
  [2, 9],
  [3, 12],
  [4, 17],
  [1, 11],
  [5, 10],
];

/**
 * Best time to post, from engagement of published posts (default: last 90 days) bucketed by
 * weekday × hour in the brand's time zone. `top` = 5 best slots (used by the post editor).
 */
export const GET = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const { brand } = await requireBrand(brandId, "analytics.view");
  const range = parseRange(req, 90);
  const posts = await publishedPosts(brandId, range);

  const sum = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const count = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const p of posts) {
    const { weekday, hour } = zonedWeekdayHour(p.publishedAt, brand.timezone);
    if (weekday < 0) continue;
    // Score = engagement rate when impressions are known, else raw engagement scaled down.
    const score = p.impressions > 0 ? (p.engagement / p.impressions) * 100 : p.engagement / 10;
    sum[weekday]![hour]! += score;
    count[weekday]![hour]! += 1;
  }
  const grid = sum.map((row, w) => row.map((s, h) => (count[w]![h]! ? s / count[w]![h]! : 0)));
  const max = Math.max(0, ...grid.flat());

  const slots: { weekday: number; hour: number; score: number; posts: number }[] = [];
  grid.forEach((row, w) => row.forEach((v, h) => count[w]![h]! > 0 && slots.push({ weekday: w, hour: h, score: v, posts: count[w]![h]! })));
  slots.sort((a, b) => b.score - a.score || b.posts - a.posts);
  const enough = posts.length >= 8;
  const picked = enough ? slots.slice(0, 5) : DEFAULT_SLOTS.map(([weekday, hour]) => ({ weekday, hour, score: 0, posts: 0 }));
  const top = picked.map((s) => ({
    ...s,
    minute: s.hour * 60,
    relative: max > 0 ? s.score / max : 0,
    label: `${WEEKDAYS[s.weekday]} ${hourLabel(s.hour)}`,
  }));

  return {
    timezone: brand.timezone,
    source: enough ? "history" : "default",
    postsAnalyzed: posts.length,
    grid,
    counts: count,
    max,
    top,
  };
});

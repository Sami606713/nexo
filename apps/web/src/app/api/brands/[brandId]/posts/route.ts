import { prisma, type Prisma } from "@postline/db";
import { POST_STATUSES, upsertPostGroupInput, type PostStatus } from "@postline/core";
import { route, badRequest } from "@/lib/http";
import { readBody } from "@/lib/posts/body";
import { requireBrand } from "@/lib/session";
import { groupInclude, toGroupDTO } from "@/lib/posts/dto";
import { visibilityWhere } from "@/lib/posts/access";
import { savePostGroup } from "@/lib/posts/save";

type Ctx = { params: Promise<{ brandId: string }> };

function parseDate(v: string | null, name: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw badRequest(`Invalid ${name} date`);
  return d;
}

/**
 * GET /api/brands/[brandId]/posts
 *   ?status=DRAFT,SCHEDULED  &from=ISO &to=ISO  &labelId= &channelId= &q=
 *   &unscheduled=include|only|exclude (default: include when no from/to, else exclude)
 *   &order=asc|desc &limit=1..500
 */
export const GET = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId);
  const url = new URL(req.url);
  const sp = url.searchParams;

  const statuses = (sp.get("status") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  for (const s of statuses) if (!(POST_STATUSES as readonly string[]).includes(s)) throw badRequest(`Unknown status ${s}`);

  const from = parseDate(sp.get("from"), "from");
  const to = parseDate(sp.get("to"), "to");
  const hasRange = !!(from || to);
  const unscheduled = sp.get("unscheduled") ?? (hasRange ? "exclude" : "include");
  const q = sp.get("q")?.trim();
  const labelId = sp.get("labelId") || undefined;
  const channelId = sp.get("channelId") || undefined;
  const order = sp.get("order") === "desc" ? "desc" : "asc";
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit") ?? 300) || 300));

  const and: Prisma.PostGroupWhereInput[] = [{ brandId }, visibilityWhere(access)];
  if (statuses.length) and.push({ status: { in: statuses as PostStatus[] } });
  if (labelId) and.push({ labels: { some: { labelId } } });
  if (channelId) and.push({ posts: { some: { channelId } } });
  if (q) {
    and.push({
      OR: [
        { caption: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
        { posts: { some: { captionOverride: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  const range: Prisma.PostGroupWhereInput = { scheduledAt: { ...(from && { gte: from }), ...(to && { lt: to }) } };
  if (unscheduled === "only") and.push({ scheduledAt: null });
  else if (unscheduled === "include") and.push(hasRange ? { OR: [range, { scheduledAt: null }] } : {});
  else and.push(hasRange ? range : { scheduledAt: { not: null } });

  const groups = await prisma.postGroup.findMany({
    where: { AND: and },
    include: groupInclude,
    orderBy: [{ scheduledAt: { sort: order, nulls: "first" } }, { updatedAt: "desc" }],
    take: limit,
  });
  return groups.map(toGroupDTO);
});

/** POST /api/brands/[brandId]/posts — create a post group. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const input = await readBody(req, upsertPostGroupInput);
  const { group, issues } = await savePostGroup(access, input);
  return { ...toGroupDTO(group), channelIssues: issues };
});

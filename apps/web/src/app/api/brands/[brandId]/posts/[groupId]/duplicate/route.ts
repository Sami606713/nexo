import { prisma, type Prisma } from "@postline/db";
import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { groupInclude, toGroupDTO } from "@/lib/posts/dto";
import { loadGroup } from "@/lib/posts/access";

type Ctx = { params: Promise<{ brandId: string; groupId: string }> };

/** Copy a group as a new DRAFT (no schedule, no approval). */
export const POST = route<Ctx>(async (_req, { params }) => {
  const { brandId, groupId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const src = await loadGroup(access, groupId);

  const copy = await prisma.postGroup.create({
    data: {
      brandId,
      authorId: access.user.id,
      caption: src.caption,
      status: "DRAFT",
      scheduledAt: null,
      timezone: src.timezone,
      options: (src.options ?? {}) as Prisma.InputJsonValue,
      notes: src.notes,
      score: src.score,
      campaignId: src.campaignId,
      posts: {
        create: src.posts.map((p) => ({ channelId: p.channelId, captionOverride: p.captionOverride, status: "DRAFT" as const })),
      },
      media: { create: src.media.map((m) => ({ mediaId: m.mediaId, position: m.position })) },
      labels: { create: src.labels.map((l) => ({ labelId: l.labelId })) },
    },
    include: groupInclude,
  });
  return toGroupDTO(copy);
});

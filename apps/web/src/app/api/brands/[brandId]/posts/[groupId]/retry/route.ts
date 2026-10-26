import { prisma } from "@postline/db";
import { conflict, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { cancelGroupPublish, enqueueGroupPublish } from "@/lib/queue";
import { groupInclude, toGroupDTO } from "@/lib/posts/dto";
import { loadGroup, viewerFor } from "@/lib/posts/access";

type Ctx = { params: Promise<{ brandId: string; groupId: string }> };

/** Retry failed channels of an ERROR / NEEDS_ATTENTION group. POSTED channels are never republished. */
export const POST = route<Ctx>(async (_req, { params }) => {
  const { brandId, groupId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const group = await loadGroup(access, groupId);
  if (group.status !== "ERROR" && group.status !== "NEEDS_ATTENTION") throw conflict("Only failed posts can be retried");
  const failed = group.posts.filter((p) => p.status === "ERROR");
  if (!failed.length) throw conflict("There are no failed channels to retry");

  const now = new Date();
  await prisma.$transaction([
    prisma.post.updateMany({ where: { groupId: group.id, status: "ERROR" }, data: { status: "SCHEDULED", attempts: 0 } }),
    prisma.postGroup.update({ where: { id: group.id }, data: { status: "SCHEDULED", scheduledAt: now, lockedAt: null } }),
  ]);
  try {
    await cancelGroupPublish(group.id);
  } catch (err) {
    console.error("[posts] cancelGroupPublish failed", err);
  }
  await enqueueGroupPublish(group.id, now);

  const fresh = await prisma.postGroup.findUniqueOrThrow({ where: { id: group.id }, include: groupInclude });
  return { ...toGroupDTO(fresh), viewer: viewerFor(access, fresh), retried: failed.length };
});

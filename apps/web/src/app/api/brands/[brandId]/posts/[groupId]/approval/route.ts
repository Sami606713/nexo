import { prisma } from "@postline/db";
import { requestApprovalInput } from "@postline/core";
import { badRequest, conflict, route } from "@/lib/http";
import { readBody } from "@/lib/posts/body";
import { requireBrand } from "@/lib/session";
import { cancelGroupPublish } from "@/lib/queue";
import { groupInclude, toGroupDTO } from "@/lib/posts/dto";
import { isLocked, loadGroup } from "@/lib/posts/access";
import { hasContent, inputFromGroup } from "@/lib/posts/save";
import { excerpt, notifyUsers } from "@/lib/posts/notify";

type Ctx = { params: Promise<{ brandId: string; groupId: string }> };

/** Request approval: (re)opens the Approval, moves the group to PENDING_APPROVAL and notifies approvers. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId, groupId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const group = await loadGroup(access, groupId);
  const body = await readBody(req, requestApprovalInput);

  if (isLocked(group.status) || group.status === "GENERATING") throw conflict("Approval is unavailable while this post is locked");
  if (!hasContent(inputFromGroup(group))) throw badRequest("Add content before requesting approval");

  const approverIds = [...new Set(body.approverIds)];
  const members = await prisma.membership.findMany({
    where: { brandId, userId: { in: approverIds } },
    select: { userId: true },
  });
  if (members.length !== approverIds.length) throw badRequest("Approvers must be members of this brand");

  try {
    await cancelGroupPublish(group.id);
  } catch (err) {
    console.error("[posts] cancelGroupPublish failed", err);
  }

  const reset = { requestedBy: access.user.id, approverIds, decision: null, decidedBy: null, decidedAt: null, comment: body.comment ?? null };
  const updated = await prisma.$transaction(async (tx) => {
    await tx.approval.upsert({
      where: { groupId: group.id },
      create: { groupId: group.id, ...reset },
      update: { ...reset, createdAt: new Date() },
    });
    await tx.post.updateMany({ where: { groupId: group.id }, data: { status: "PENDING_APPROVAL" } });
    if (body.comment?.trim()) {
      await tx.postComment.create({ data: { groupId: group.id, authorId: access.user.id, body: body.comment.trim() } });
    }
    return tx.postGroup.update({
      where: { id: group.id },
      data: { status: "PENDING_APPROVAL", lockedAt: null },
      include: groupInclude,
    });
  });

  await notifyUsers(
    approverIds.filter((id) => id !== access.user.id),
    brandId,
    "approval_requested",
    {
      groupId: group.id,
      brandName: access.brand.name,
      requestedBy: access.user.name ?? access.user.email,
      excerpt: excerpt(group.caption),
      comment: body.comment ?? null,
      url: `/app/${brandId}/posts/${group.id}`,
    },
  );

  return toGroupDTO(updated);
});

import { prisma } from "@postline/db";
import { decideApprovalInput } from "@postline/core";
import { conflict, forbidden, route } from "@/lib/http";
import { readBody } from "@/lib/posts/body";
import { requireBrand } from "@/lib/session";
import { groupInclude, toGroupDTO } from "@/lib/posts/dto";
import { loadGroup } from "@/lib/posts/access";
import { syncPublishQueue } from "@/lib/posts/save";
import { excerpt, notifyUsers } from "@/lib/posts/notify";

type Ctx = { params: Promise<{ brandId: string; groupId: string }> };

const REJECTED_MESSAGE = "This post has been rejected and moved back to draft.";

export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId, groupId } = await params;
  const access = await requireBrand(brandId, "posts.approve");
  const group = await loadGroup(access, groupId);
  const body = await readBody(req, decideApprovalInput);

  const approval = group.approval;
  if (!approval || group.status !== "PENDING_APPROVAL") throw conflict("This post isn't waiting for approval");
  if (approval.decision) throw conflict("This approval has already been decided");
  if (!approval.approverIds.includes(access.user.id)) throw forbidden("You're not an approver for this post");

  const now = new Date();
  let status: "SCHEDULED" | "DRAFT";
  let scheduledAt = group.scheduledAt;
  let message: string;

  if (body.decision === "approved") {
    if (scheduledAt && scheduledAt.getTime() > now.getTime()) {
      status = "SCHEDULED";
      message = "Approved and scheduled.";
    } else if (scheduledAt) {
      status = "DRAFT";
      scheduledAt = null;
      message = "Post approved — pick a new time, the original one has passed.";
    } else {
      status = "DRAFT";
      message = "Post approved. Schedule it when you're ready.";
    }
  } else {
    status = "DRAFT";
    scheduledAt = null;
    message = REJECTED_MESSAGE;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.approval.update({
      where: { id: approval.id },
      data: { decision: body.decision, decidedBy: access.user.id, decidedAt: now, comment: body.comment ?? approval.comment },
    });
    await tx.post.updateMany({ where: { groupId: group.id }, data: { status } });
    const who = access.user.name ?? access.user.email;
    const note =
      body.decision === "approved"
        ? `Approved by ${who}${status === "DRAFT" && group.scheduledAt ? " — approved, pick a new time" : ""}`
        : `Rejected by ${who}`;
    await tx.postComment.create({
      data: { groupId: group.id, authorId: access.user.id, body: body.comment?.trim() ? `${note}: ${body.comment.trim()}` : note },
    });
    return tx.postGroup.update({ where: { id: group.id }, data: { status, scheduledAt }, include: groupInclude });
  });

  await syncPublishQueue(group.id, status, scheduledAt);

  await notifyUsers([approval.requestedBy].filter((id) => id !== access.user.id), brandId, "approval_decided", {
    groupId: group.id,
    brandName: access.brand.name,
    decision: body.decision,
    decidedBy: access.user.name ?? access.user.email,
    comment: body.comment ?? null,
    excerpt: excerpt(group.caption),
    url: `/app/${brandId}/posts/${group.id}`,
  });

  const fresh = status === "SCHEDULED" ? await prisma.postGroup.findUniqueOrThrow({ where: { id: group.id }, include: groupInclude }) : updated;
  return { group: toGroupDTO(fresh), message };
});

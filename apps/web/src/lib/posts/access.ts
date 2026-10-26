import "server-only";
import { prisma, type Prisma } from "@postline/db";
import { can, LOCKED_STATUSES, type PostStatus, type Role } from "@postline/core";
import type { BrandAccess } from "@/lib/session";
import { HttpError, notFound } from "@/lib/http";
import { groupInclude, type GroupWithRelations } from "./dto";
import type { ViewerDTO } from "./types";

/** Statuses hidden from roles without `posts.viewDrafts` (unless they're an approver). */
export const HIDDEN_FROM_CLIENT: PostStatus[] = ["DRAFT", "GENERATING", "PENDING_APPROVAL"];

export const LOCKED_MESSAGE = "Posts lock while publishing or after publishing";

/** Prisma filter restricting what a member may see. */
export function visibilityWhere(access: BrandAccess): Prisma.PostGroupWhereInput {
  if (can(access.membership.role as Role, "posts.viewDrafts")) return {};
  return {
    OR: [{ status: { notIn: HIDDEN_FROM_CLIENT } }, { approval: { is: { approverIds: { has: access.user.id } } } }],
  };
}

export function isLocked(status: string): boolean {
  return (LOCKED_STATUSES as readonly string[]).includes(status);
}

/** Load one group of this brand that the caller is allowed to see, or 404. */
export async function loadGroup(access: BrandAccess, groupId: string): Promise<GroupWithRelations> {
  const group = await prisma.postGroup.findFirst({
    where: { AND: [{ id: groupId, brandId: access.brand.id }, visibilityWhere(access)] },
    include: groupInclude,
  });
  if (!group) throw notFound("Post not found");
  return group;
}

export function assertNotLocked(status: string, message = LOCKED_MESSAGE) {
  if (isLocked(status)) throw new HttpError(409, message);
}

export function viewerFor(access: BrandAccess, group: GroupWithRelations): ViewerDTO {
  const role = access.membership.role as Role;
  const isApprover = !!group.approval?.approverIds.includes(access.user.id);
  return {
    canWrite: can(role, "posts.write"),
    isApprover,
    canDecide: isApprover && can(role, "posts.approve") && group.status === "PENDING_APPROVAL" && !group.approval?.decision,
    locked: isLocked(group.status),
  };
}

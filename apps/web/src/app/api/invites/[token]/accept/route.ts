import { prisma } from "@postline/db";
import { badRequest, forbidden, notFound, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { findValidInvite } from "@/lib/invites";
import { ownerPlan, ownerSeatCount } from "@/lib/billing";

type Ctx = { params: Promise<{ token: string }> };

export const POST = route<Ctx>(async (_req, { params }) => {
  const { token } = await params;
  const user = await requireUser();
  const { invite, reason } = await findValidInvite(token);
  if (!invite) throw notFound(reason);
  if (reason) throw badRequest(reason);
  if (invite.email.toLowerCase() !== user.email.toLowerCase())
    throw forbidden(`This invitation was sent to ${invite.email}. Sign in with that email to accept it.`);

  const existing = await prisma.membership.findUnique({ where: { userId_brandId: { userId: user.id, brandId: invite.brandId } } });
  if (!existing) {
    // Seat check: the invitee is counted as pending already, so only fail if strictly over the limit.
    const { ownerId, limits } = await ownerPlan(invite.brandId);
    const seats = await ownerSeatCount(ownerId);
    if (seats.total > limits.users) throw forbidden("This workspace has reached its user limit. Ask the owner to upgrade.");
    await prisma.membership.create({ data: { userId: user.id, brandId: invite.brandId, role: invite.role } });
  }
  await prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
  return { brandId: invite.brandId };
});

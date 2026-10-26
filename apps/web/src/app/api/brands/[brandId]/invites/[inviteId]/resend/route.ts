import { prisma } from "@postline/db";
import { notFound, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { INVITE_TTL_MS, inviteDto, newInviteToken, sendInviteEmail } from "@/lib/invites";

type Ctx = { params: Promise<{ brandId: string; inviteId: string }> };

/** Rotate token, extend expiry 7 days, re-send the email. */
export const POST = route<Ctx>(async (_req, { params }) => {
  const { brandId, inviteId } = await params;
  const { user, brand } = await requireBrand(brandId, "members.manage");
  const existing = await prisma.invite.findFirst({ where: { id: inviteId, brandId, acceptedAt: null } });
  if (!existing) throw notFound("Invite not found");
  const invite = await prisma.invite.update({
    where: { id: existing.id },
    data: { token: newInviteToken(), expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  });
  await sendInviteEmail(invite, brand.name, user.name ?? user.email);
  return inviteDto(invite);
});

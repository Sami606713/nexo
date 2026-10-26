import { z } from "zod";
import { prisma } from "@postline/db";
import { conflict, forbidden, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { INVITE_TTL_MS, inviteDto, newInviteToken, sendInviteEmail } from "@/lib/invites";
import { ownerPlan, ownerSeatCount } from "@/lib/billing";

type Ctx = { params: Promise<{ brandId: string }> };

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["ADMIN", "MANAGER", "CLIENT"]),
});

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId, "members.manage");
  const invites = await prisma.invite.findMany({ where: { brandId, acceptedAt: null }, orderBy: { createdAt: "desc" } });
  return invites.map(inviteDto);
});

export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const { user, brand } = await requireBrand(brandId, "members.manage");
  const { email, role } = await parseBody(req, schema);

  const existingMember = await prisma.membership.findFirst({ where: { brandId, user: { email } } });
  if (existingMember) throw conflict("This person is already a member of the brand");

  const { ownerId, limits } = await ownerPlan(brandId);
  const otherBrandMember = await prisma.membership.findFirst({ where: { brand: { ownerId }, user: { email } } });
  const alreadyInvited = await prisma.invite.findFirst({
    where: { brand: { ownerId }, email, acceptedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!otherBrandMember && !alreadyInvited) {
    const seats = await ownerSeatCount(ownerId);
    if (seats.total >= limits.users)
      throw forbidden(`Your ${limits.label} plan includes ${limits.users} user${limits.users === 1 ? "" : "s"}. Upgrade to invite more people.`);
  }

  // Re-inviting the same email for this brand refreshes the existing invite.
  await prisma.invite.deleteMany({ where: { brandId, email, acceptedAt: null } });
  const invite = await prisma.invite.create({
    data: { brandId, email, role, token: newInviteToken(), invitedBy: user.id, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  });
  await sendInviteEmail(invite, brand.name, user.name ?? user.email);
  return inviteDto(invite);
});

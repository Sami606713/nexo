import { z } from "zod";
import { prisma } from "@postline/db";
import { can } from "@postline/core";
import { badRequest, forbidden, notFound, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";

type Ctx = { params: Promise<{ brandId: string; membershipId: string }> };

const schema = z.object({ role: z.enum(["ADMIN", "MANAGER", "CLIENT"]) });

async function target(brandId: string, membershipId: string) {
  const m = await prisma.membership.findFirst({ where: { id: membershipId, brandId } });
  if (!m) throw notFound("Member not found");
  return m;
}

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { brandId, membershipId } = await params;
  const { membership: me } = await requireBrand(brandId, "members.manage");
  const { role } = await parseBody(req, schema);
  const m = await target(brandId, membershipId);
  if (m.role === "OWNER") throw badRequest("The owner's role can't be changed");
  if (m.id === me.id) throw badRequest("You can't change your own role");
  return prisma.membership.update({ where: { id: m.id }, data: { role } });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { brandId, membershipId } = await params;
  const { membership: me } = await requireBrand(brandId);
  const m = await target(brandId, membershipId);
  if (m.role === "OWNER") throw badRequest("The owner can't be removed");
  // Anyone may leave; removing others needs members.manage.
  if (m.id !== me.id && !can(me.role, "members.manage")) throw forbidden();
  await prisma.membership.delete({ where: { id: m.id } });
  return { ok: true };
});

import { prisma } from "@postline/db";
import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";

type Ctx = { params: Promise<{ brandId: string; inviteId: string }> };

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { brandId, inviteId } = await params;
  await requireBrand(brandId, "members.manage");
  await prisma.invite.deleteMany({ where: { id: inviteId, brandId, acceptedAt: null } });
  return { ok: true };
});

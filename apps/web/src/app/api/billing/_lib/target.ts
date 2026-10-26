import "server-only";
import { prisma } from "@postline/db";
import { requireBrand, requireUser } from "@/lib/session";

/** Whose subscription is being managed: the brand OWNER when brandId is given (needs billing.manage), else the caller. */
export async function billingTarget(brandId: string | undefined) {
  if (brandId) {
    const { brand } = await requireBrand(brandId, "billing.manage");
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: brand.ownerId }, select: { id: true, email: true, name: true } });
    return { user: owner, brandId };
  }
  const u = await requireUser();
  return { user: { id: u.id, email: u.email, name: u.name }, brandId: undefined };
}

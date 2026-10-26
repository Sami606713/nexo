import { prisma } from "@postline/db";
import { brandInput } from "@postline/core";
import { badRequest, forbidden, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";

type Ctx = { params: Promise<{ brandId: string }> };

function validTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  const { brand, membership } = await requireBrand(brandId);
  return { ...brand, role: membership.role };
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId, "brand.settings");
  const input = await parseBody(req, brandInput.partial());
  if (input.timezone && !validTimezone(input.timezone)) throw badRequest("Unknown timezone");
  return prisma.brand.update({ where: { id: brandId }, data: input });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  const { membership } = await requireBrand(brandId);
  if (membership.role !== "OWNER") throw forbidden("Only the brand owner can delete it");
  await prisma.brand.delete({ where: { id: brandId } });
  return { ok: true };
});

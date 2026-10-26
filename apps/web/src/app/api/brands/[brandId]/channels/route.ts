import { prisma } from "@postline/db";
import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { channelPublicSelect } from "@/lib/channels";

type Ctx = { params: Promise<{ brandId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId);
  return prisma.channel.findMany({ where: { brandId }, select: channelPublicSelect, orderBy: [{ network: "asc" }, { name: "asc" }] });
});

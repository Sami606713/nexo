import { prisma } from "@postline/db";
import { notFound, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";

type Ctx = { params: Promise<{ brandId: string; channelId: string }> };

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { brandId, channelId } = await params;
  await requireBrand(brandId, "channels.connect");
  const { count } = await prisma.channel.deleteMany({ where: { id: channelId, brandId } });
  if (!count) throw notFound("Channel not found");
  return { ok: true };
});

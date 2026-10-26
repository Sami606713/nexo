// OWNED BY: inbox agent. Saved replies: GET list / POST create.
import { prisma } from "@postline/db";
import { parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { snippetSchema } from "../inbox/_lib/server";

type Ctx = { params: Promise<{ brandId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId);
  return prisma.replySnippet.findMany({ where: { brandId }, orderBy: { title: "asc" }, select: { id: true, title: true, body: true } });
});

export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId, "posts.write");
  const data = await parseBody(req, snippetSchema);
  return prisma.replySnippet.create({ data: { ...data, brandId }, select: { id: true, title: true, body: true } });
});

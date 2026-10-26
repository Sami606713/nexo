// OWNED BY: inbox agent. PATCH / DELETE one saved reply.
import { prisma } from "@postline/db";
import { notFound, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { snippetSchema } from "../../inbox/_lib/server";

type Ctx = { params: Promise<{ brandId: string; id: string }> };

async function load(brandId: string, id: string) {
  const s = await prisma.replySnippet.findFirst({ where: { id, brandId }, select: { id: true } });
  if (!s) throw notFound("Snippet not found");
}

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId, "posts.write");
  const data = await parseBody(req, snippetSchema.partial());
  await load(brandId, id);
  return prisma.replySnippet.update({ where: { id }, data, select: { id: true, title: true, body: true } });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId, "posts.write");
  await load(brandId, id);
  await prisma.replySnippet.delete({ where: { id } });
  return { ok: true };
});

import { z } from "zod";
import { prisma } from "@postline/db";
import { route } from "@/lib/http";
import { readBody } from "@/lib/posts/body";
import { requireBrand } from "@/lib/session";
import { loadGroup } from "@/lib/posts/access";
import { userLiteSelect } from "@/lib/posts/dto";
import type { CommentDTO } from "@/lib/posts/types";

type Ctx = { params: Promise<{ brandId: string; groupId: string }> };

const commentInput = z.object({ body: z.string().trim().min(1, "Write a comment first").max(5000) });

async function withAuthors(rows: { id: string; body: string; createdAt: Date; authorId: string }[]): Promise<CommentDTO[]> {
  const ids = [...new Set(rows.map((r) => r.authorId))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: userLiteSelect }) : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({ id: r.id, body: r.body, createdAt: r.createdAt.toISOString(), author: byId.get(r.authorId) ?? null }));
}

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId, groupId } = await params;
  const access = await requireBrand(brandId);
  const group = await loadGroup(access, groupId);
  const rows = await prisma.postComment.findMany({ where: { groupId: group.id }, orderBy: { createdAt: "asc" }, take: 500 });
  return withAuthors(rows);
});

/** Any member who can see the post (including CLIENT) may comment. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId, groupId } = await params;
  const access = await requireBrand(brandId);
  const group = await loadGroup(access, groupId);
  const { body } = await readBody(req, commentInput);
  const row = await prisma.postComment.create({ data: { groupId: group.id, authorId: access.user.id, body } });
  const [dto] = await withAuthors([row]);
  return dto;
});

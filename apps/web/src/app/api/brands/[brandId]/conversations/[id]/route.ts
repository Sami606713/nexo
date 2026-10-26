// OWNED BY: inbox agent. GET (marks read) / PATCH one conversation.
import { z } from "zod";
import { prisma } from "@postline/db";
import { badRequest, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import type { ConversationDetailDto } from "@/components/inbox/types";
import { conversationSelect, loadConversation, peopleById, postContext, toConversationDto } from "../../inbox/_lib/server";

type Ctx = { params: Promise<{ brandId: string; id: string }> };

async function detail(brandId: string, id: string): Promise<ConversationDetailDto> {
  const c = await loadConversation(brandId, id);
  const people = await peopleById([c.assigneeId]);
  let post: ConversationDetailDto["post"] = null;
  if (c.postId) {
    const p = await prisma.post.findFirst({
      where: { id: c.postId, channel: { brandId } },
      select: { captionOverride: true, url: true, group: { select: { caption: true } } },
    });
    if (p) post = { excerpt: (p.captionOverride || p.group.caption || "").slice(0, 400) || null, url: p.url };
  }
  if (!post && c.kind !== "DM") {
    const first = await prisma.message.findFirst({ where: { conversationId: c.id }, orderBy: { createdAt: "asc" }, select: { attachments: true } });
    const ctx = postContext(first?.attachments);
    if (ctx) post = { excerpt: ctx.text, url: ctx.url };
  }
  return { ...toConversationDto(c, people), post };
}

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId);
  await prisma.conversation.updateMany({ where: { id, brandId, unread: true }, data: { unread: false } });
  return detail(brandId, id);
});

const patchSchema = z
  .object({
    status: z.enum(["OPEN", "RESOLVED", "ARCHIVED"]).optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    labels: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).optional(),
    unread: z.boolean().optional(),
  })
  .strict();

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId, "posts.write");
  const body = await parseBody(req, patchSchema);
  await loadConversation(brandId, id);
  if (body.assigneeId) {
    const m = await prisma.membership.findUnique({ where: { userId_brandId: { userId: body.assigneeId, brandId } }, select: { id: true } });
    if (!m) throw badRequest("That person isn't a member of this brand");
  }
  await prisma.conversation.update({
    where: { id },
    data: {
      ...(body.status ? { status: body.status } : {}),
      ...(body.assigneeId !== undefined ? { assigneeId: body.assigneeId } : {}),
      ...(body.labels ? { labels: [...new Set(body.labels)] } : {}),
      ...(body.unread !== undefined ? { unread: body.unread } : {}),
    },
    select: conversationSelect,
  });
  return detail(brandId, id);
});

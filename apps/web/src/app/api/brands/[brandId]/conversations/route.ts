// OWNED BY: inbox agent. GET /api/brands/[brandId]/conversations — paged inbox list, newest first.
import { prisma, Prisma } from "@postline/db";
import { badRequest, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import type { ConversationKind, ConversationListResponse } from "@/components/inbox/types";
import { KINDS, STATUSES, conversationSelect, peopleById, toConversationDto } from "../inbox/_lib/server";

type Ctx = { params: Promise<{ brandId: string }> };
const PAGE = 30;

export const GET = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const { user } = await requireBrand(brandId);
  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind")?.toUpperCase();
  const status = (sp.get("status") ?? "OPEN").toUpperCase();
  const channelId = sp.get("channelId") || undefined;
  const q = sp.get("q")?.trim().slice(0, 200) || undefined;
  const cursor = sp.get("cursor") || undefined;
  if (kind && !KINDS.includes(kind as ConversationKind)) throw badRequest("Unknown kind");
  if (status !== "ALL" && !STATUSES.includes(status as never)) throw badRequest("Unknown status");

  const base: Prisma.ConversationWhereInput = {
    brandId,
    ...(status === "ALL" ? { status: { not: "ARCHIVED" } } : { status }),
    ...(sp.get("assigned") === "me" ? { assigneeId: user.id } : {}),
    ...(channelId ? { channelId } : {}),
    ...(q
      ? {
          OR: [
            { participantName: { contains: q, mode: "insensitive" } },
            { participantHandle: { contains: q, mode: "insensitive" } },
            { lastMessagePreview: { contains: q, mode: "insensitive" } },
            { labels: { has: q.toLowerCase() } },
            { messages: { some: { text: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const where: Prisma.ConversationWhereInput = { ...base, ...(kind ? { kind } : {}) };

  const [rows, grouped, unread] = await Promise.all([
    prisma.conversation.findMany({
      where,
      select: conversationSelect,
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.conversation.groupBy({ by: ["kind"], where: base, _count: { _all: true } }),
    prisma.conversation.count({ where: { brandId, status: "OPEN", unread: true } }),
  ]);
  const page = rows.slice(0, PAGE);
  const people = await peopleById(page.map((r) => r.assigneeId));
  const counts = { DM: 0, COMMENT: 0, MENTION: 0 } as Record<ConversationKind, number>;
  for (const g of grouped) if (KINDS.includes(g.kind as ConversationKind)) counts[g.kind as ConversationKind] = g._count._all;
  const out: ConversationListResponse = {
    conversations: page.map((r) => toConversationDto(r, people)),
    nextCursor: rows.length > PAGE ? (page[page.length - 1]?.id ?? null) : null,
    counts,
    unread,
  };
  return out;
});

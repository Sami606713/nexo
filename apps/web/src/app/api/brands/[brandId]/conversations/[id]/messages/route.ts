// OWNED BY: inbox agent. GET the messages of one conversation (oldest first).
import { prisma } from "@postline/db";
import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import type { MessageDto } from "@/components/inbox/types";
import { isUndelivered, loadConversation, peopleById } from "../../../inbox/_lib/server";

type Ctx = { params: Promise<{ brandId: string; id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId, id } = await params;
  await requireBrand(brandId);
  await loadConversation(brandId, id);
  const rows = await prisma.message.findMany({ where: { conversationId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 500 });
  const people = await peopleById(rows.map((r) => r.sentById));
  return rows.map(
    (m): MessageDto => ({
      id: m.id,
      direction: m.direction === "OUT" ? "OUT" : "IN",
      authorName: m.authorName,
      text: m.text,
      createdAt: m.createdAt.toISOString(),
      sentBy: m.sentById ? (people.get(m.sentById) ?? null) : null,
      undelivered: m.direction === "OUT" && isUndelivered(m.attachments),
    }),
  );
});

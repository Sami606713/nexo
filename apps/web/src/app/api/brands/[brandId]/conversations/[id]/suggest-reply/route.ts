// OWNED BY: inbox agent. POST → reply draft in brand voice from the last four messages (1 credit).
// Uses the configured @postline/ai provider. Without AI configured, a deterministic friendly template is
// returned and no credit is charged.
// NOTE: AiService has no dedicated reply method yet, so we ask `ai.rewrite` to polish an intent-matched
// draft with the conversation as context. Swap for `ai.suggestReply` (see buildSuggestPrompt) when the lead adds it.
import { prisma } from "@postline/db";
import { CREDIT_COST } from "@postline/core";
import { ai, brandContext, hasApiKey, withCredits } from "@postline/ai";
import { badRequest, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { loadConversation, postContext, templateReply } from "../../../inbox/_lib/server";
import { enforceRateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ brandId: string; id: string }> };

export const POST = route<Ctx>(async (_req, { params }) => {
  const { brandId, id } = await params;
  const { user, brand } = await requireBrand(brandId, "posts.write");
  await enforceRateLimit("ai", user.id);
  const conv = await loadConversation(brandId, id);
  const last = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 4,
    select: { direction: true, authorName: true, text: true, attachments: true },
  });
  if (last.length < 2) throw badRequest("The conversation is too short to suggest a reply");
  const messages = last.reverse();

  if (!hasApiKey()) {
    return { text: templateReply(brand.name, conv.participantName, conv.kind, messages), source: "template", credits: 0 };
  }
  const first = await prisma.message.findFirst({ where: { conversationId: id }, orderBy: { createdAt: "asc" }, select: { attachments: true } });
  const excerpt = postContext(first?.attachments)?.text;
  const draft = templateReply(brand.name, conv.participantName, conv.kind, messages);
  const where = conv.kind === "DM" ? "a private message" : conv.kind === "COMMENT" ? "a public comment thread" : "a public mention";
  const context = [
    `This text is our draft reply to ${conv.participantName} in ${where} on ${conv.channel.network}.`,
    "Improve it so it directly and specifically answers the customer's latest message below, warmly and in the brand voice.",
    "1–3 sentences. Never invent prices, dates, policies, discounts, links or order details — offer help or ask for details instead.",
    excerpt ? `They are commenting on our post: "${excerpt.slice(0, 400)}"` : "",
    "Conversation (oldest first):",
    ...messages.map((m) => `${m.direction === "IN" ? `${m.authorName || conv.participantName} (customer)` : `${brand.name} (us)`}: ${(m.text ?? "").slice(0, 1000)}`),
  ]
    .filter(Boolean)
    .join("\n");
  const text = await withCredits(
    { brandId, actorId: user.id, reason: "reply_suggest", amount: CREDIT_COST.reply_suggest, refType: "conversation", refId: id },
    async () => (await ai.rewrite(brandContext(brand), { text: draft, context, action: "rewrite", tone: "friendly" })).trim(),
  );
  return { text, source: "ai", credits: CREDIT_COST.reply_suggest };
});

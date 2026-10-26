// OWNED BY: inbox agent. POST {text} → send via the network's inbox provider and store the OUT message.
// Demo channels / networks without a configured provider: the message is stored with a "not delivered" flag.
import { z } from "zod";
import { prisma, Prisma } from "@postline/db";
import { AdapterError, type Network } from "@postline/core";
import { decryptCredentials } from "@postline/core/crypto";
import { getInboxProvider, type InboxKind } from "@postline/integrations";
import { HttpError, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import type { MessageDto } from "@/components/inbox/types";
import { UNDELIVERED, isDemoChannel, loadConversation } from "../../../inbox/_lib/server";

type Ctx = { params: Promise<{ brandId: string; id: string }> };
const schema = z.object({ text: z.string().trim().min(1, "Write a reply first").max(5000) });

export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId, id } = await params;
  const { user } = await requireBrand(brandId, "posts.write");
  const { text } = await parseBody(req, schema);
  const conv = await loadConversation(brandId, id);
  const channel = await prisma.channel.findUniqueOrThrow({
    where: { id: conv.channel.id },
    select: { network: true, externalId: true, credentialsEnc: true, extras: true },
  });
  const provider = isDemoChannel(channel.extras) ? undefined : getInboxProvider(channel.network as Network);

  let externalId: string | null = null;
  if (provider) {
    const lastIn = await prisma.message.findFirst({
      where: { conversationId: id, direction: "IN", externalId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { externalId: true },
    });
    try {
      const res = await provider.reply(
        decryptCredentials(channel.credentialsEnc),
        { ...((channel.extras ?? {}) as Record<string, unknown>), externalId: channel.externalId },
        {
          kind: conv.kind as InboxKind,
          externalId: lastIn?.externalId ?? conv.externalId,
          conversationExternalId: conv.externalId,
          postExternalId: conv.postExternalId,
          authorHandle: conv.participantHandle,
        },
        text,
      );
      externalId = res.externalId;
    } catch (err) {
      if (err instanceof AdapterError) {
        if (err.kind === "auth") {
          await prisma.channel.update({
            where: { id: conv.channel.id },
            data: { health: "NEEDS_RECONNECT", lastError: { kind: "auth", message: err.message, at: new Date().toISOString() } },
          });
          throw new HttpError(409, "This channel needs to be reconnected before you can reply.");
        }
        throw new HttpError(502, `Couldn't send the reply: ${err.message}`);
      }
      throw err;
    }
  }

  const now = new Date();
  const msg = await prisma.message.create({
    data: {
      conversationId: id,
      direction: "OUT",
      authorName: user.name ?? user.email,
      text,
      externalId,
      sentById: user.id,
      attachments: (provider ? [] : [UNDELIVERED]) as Prisma.InputJsonValue,
      createdAt: now,
    },
  });
  await prisma.conversation.update({
    where: { id },
    data: { lastMessageAt: now, lastMessagePreview: text.replace(/\s+/g, " ").slice(0, 140), unread: false },
  });
  const out: MessageDto = {
    id: msg.id,
    direction: "OUT",
    authorName: msg.authorName,
    text: msg.text,
    createdAt: msg.createdAt.toISOString(),
    sentBy: { id: user.id, name: user.name, email: user.email, image: user.image },
    undelivered: !provider,
  };
  return out;
});

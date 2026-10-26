import { readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import type { InboxItem, InboxProvider } from "@postline/integrations";

function envVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const env = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
    return env.match(new RegExp(`^${name}=(.+)$`, "m"))?.[1]?.trim();
  } catch {
    return undefined;
  }
}

async function reachable(url: string | undefined): Promise<boolean> {
  if (!url) return false;
  try {
    const u = new URL(url);
    return await new Promise<boolean>((resolve) => {
      const sock = createConnection({ host: u.hostname, port: Number(u.port || 5432) });
      const done = (ok: boolean) => {
        sock.destroy();
        resolve(ok);
      };
      sock.setTimeout(1000, () => done(false));
      sock.once("connect", () => done(true));
      sock.once("error", () => done(false));
    });
  } catch {
    return false;
  }
}

const DB_URL = envVar("DATABASE_URL");
const KEY = envVar("TOKEN_ENCRYPTION_KEY");
const dbUp = !!KEY && (await reachable(DB_URL));
if (dbUp) {
  process.env.DATABASE_URL = DB_URL;
  process.env.TOKEN_ENCRYPTION_KEY = KEY;
}

describe.skipIf(!dbUp)("inbox sync (Postgres integration)", async () => {
  const { prisma } = await import("@postline/db");
  const { encryptCredentials } = await import("@postline/core/crypto");
  const { syncChannelInbox } = await import("../src/workers/sync");
  const tag = `inboxtest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({ data: { email: `${tag}@example.test` } });
  const brand = await prisma.brand.create({ data: { ownerId: user.id, name: tag } });
  const channel = await prisma.channel.create({
    data: { brandId: brand.id, network: "BLUESKY", externalId: `did:plc:${tag}`, name: "Test", credentialsEnc: encryptCredentials({}), inboxEnabled: true },
  });
  const wfMatch = await prisma.workflow.create({
    data: { brandId: brand.id, name: "reply bot", active: true, trigger: { type: "new_comment", config: { channelId: channel.id } } },
  });
  await prisma.workflow.create({ data: { brandId: brand.id, name: "other post", active: true, trigger: { type: "new_comment", config: { postExternalId: "nope" } } } });
  await prisma.workflow.create({ data: { brandId: brand.id, name: "inactive", active: false, trigger: { type: "new_comment", config: {} } } });

  afterAll(async () => {
    await prisma.brand.delete({ where: { id: brand.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  });

  const item = (over: Partial<InboxItem>): InboxItem => ({
    kind: "COMMENT",
    conversationExternalId: "root|ann",
    messageExternalId: "m1",
    text: "Do you ship to Canada?",
    authorName: "Ann",
    authorHandle: "ann.test",
    createdAt: new Date("2026-10-01T10:00:00Z"),
    postExternalId: "root",
    postExcerpt: "Our fall collection",
    ...over,
  });
  let items: InboxItem[] = [];
  let sinceSeen: Date | undefined;
  const provider: InboxProvider = {
    network: "BLUESKY",
    fetch: async (_c, extras, since) => {
      expect(extras.externalId).toBe(channel.externalId);
      sinceSeen = since;
      return items;
    },
    reply: async () => ({ externalId: "x" }),
  };
  const runs: unknown[] = [];
  const deps = { provider: () => provider, enqueueWorkflowRun: async (j: unknown) => runs.push(j), now: () => new Date("2026-10-02T00:00:00Z") };

  it("creates conversations + messages, dispatches matching workflows, records inboxSyncedAt", async () => {
    items = [item({}), item({ messageExternalId: "m0", text: "Love this!", createdAt: new Date("2026-10-01T09:00:00Z") }), item({ kind: "MENTION", conversationExternalId: "p2|bob", messageExternalId: "m2", authorName: "Bob", postExternalId: undefined })];
    const r = await syncChannelInbox(channel.id, deps);
    expect(r).toMatchObject({ fetched: 3, newMessages: 3, newConversations: 2, workflowRuns: 2 });
    expect(runs.every((j) => (j as { workflowId: string }).workflowId === wfMatch.id)).toBe(true);
    expect(runs[0]).toMatchObject({ input: { text: "Love this!", authorName: "Ann", channelId: channel.id, postExternalId: "root" } });
    const conv = await prisma.conversation.findFirstOrThrow({ where: { channelId: channel.id, kind: "COMMENT" }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    expect(conv).toMatchObject({ unread: true, lastMessagePreview: "Do you ship to Canada?", participantName: "Ann", postExternalId: "root" });
    expect(conv.messages.map((m) => m.externalId)).toEqual(["m0", "m1"]);
    expect(conv.messages[0]!.attachments).toEqual([{ type: "post_context", text: "Our fall collection", url: null }]);
    const ch = await prisma.channel.findUniqueOrThrow({ where: { id: channel.id } });
    expect((ch.extras as Record<string, unknown>).inboxSyncedAt).toBe("2026-10-02T00:00:00.000Z");
  });

  it("dedupes on re-sync, reopens resolved conversations on new inbound messages", async () => {
    const conv = await prisma.conversation.findFirstOrThrow({ where: { channelId: channel.id, kind: "COMMENT" } });
    await prisma.conversation.update({ where: { id: conv.id }, data: { status: "RESOLVED", unread: false } });
    runs.length = 0;
    items = [item({}), item({ messageExternalId: "m3", text: "Thanks!", createdAt: new Date("2026-10-02T00:00:00Z") })];
    const r = await syncChannelInbox(channel.id, deps);
    expect(sinceSeen?.toISOString()).toBe("2026-10-01T23:55:00.000Z");
    expect(r).toMatchObject({ newMessages: 1, newConversations: 0, workflowRuns: 1 });
    const after = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(after).toMatchObject({ status: "OPEN", unread: true, lastMessagePreview: "Thanks!" });
  });

  it("skips disabled and demo channels", async () => {
    await prisma.channel.update({ where: { id: channel.id }, data: { extras: { demo: true } } });
    expect((await syncChannelInbox(channel.id, deps)).skipped).toBe("demo channel");
    await prisma.channel.update({ where: { id: channel.id }, data: { inboxEnabled: false } });
    expect((await syncChannelInbox(channel.id, deps)).skipped).toBe("inbox disabled");
  });
});

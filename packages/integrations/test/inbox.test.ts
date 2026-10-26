import { afterEach, describe, expect, it, vi } from "vitest";
import { getInboxProvider, htmlToText, inboxSupported } from "../src/index";
import { mapNotification } from "../src/inbox/bluesky";
import { mapMastodon } from "../src/inbox/mastodon";
import { mapConversation, mapIgComments } from "../src/inbox/meta";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

type Handler = (url: URL, init: RequestInit) => unknown;
function mockFetch(handler: Handler) {
  const calls: { url: URL; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      calls.push({ url, init });
      const body = handler(url, init);
      if (body instanceof Response) return body;
      return new Response(JSON.stringify(body ?? {}), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

// exp far in the future
const jwt = `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.y`;
const bskyCreds = { accessJwt: jwt, refreshJwt: jwt, did: "did:plc:me", handle: "me.bsky.social", pdsUrl: "https://pds.test" };

describe("registry", () => {
  it("supports FB/IG/Bluesky/Mastodon, Meta only with META_APP_ID", () => {
    vi.stubEnv("META_APP_ID", "");
    expect(inboxSupported("FACEBOOK")).toBe(true);
    expect(inboxSupported("X")).toBe(false);
    expect(getInboxProvider("BLUESKY")?.network).toBe("BLUESKY");
    expect(getInboxProvider("MASTODON")?.network).toBe("MASTODON");
    expect(getInboxProvider("FACEBOOK")).toBeUndefined();
    expect(getInboxProvider("TELEGRAM")).toBeUndefined();
    vi.stubEnv("META_APP_ID", "123");
    expect(getInboxProvider("INSTAGRAM")?.network).toBe("INSTAGRAM");
  });
  it("strips HTML", () => {
    expect(htmlToText('<p>Hi <span class="h-card"><a href="x">@me</a></span> &amp; you</p><p>line2<br/>3</p>')).toBe("Hi @me & you\n\nline2\n3");
  });
});

describe("bluesky inbox", () => {
  const notif = (over: Record<string, unknown>) => ({
    uri: "at://did:plc:a/app.bsky.feed.post/1",
    cid: "c1",
    author: { did: "did:plc:a", handle: "ann.bsky.social", displayName: "Ann" },
    reason: "mention",
    record: { text: "hey @me", createdAt: "2026-10-01T10:00:00Z" },
    indexedAt: "2026-10-01T10:00:01Z",
    ...over,
  });

  it("maps replies to COMMENTs grouped by root+author, mentions to MENTION, drops likes", () => {
    const reply = mapNotification(
      notif({ reason: "reply", record: { text: "love it", reply: { root: { uri: "at://me/p/root", cid: "r" }, parent: { uri: "at://me/p/root", cid: "r" } } } }),
    );
    expect(reply).toMatchObject({ kind: "COMMENT", conversationExternalId: "at://me/p/root|did:plc:a", postExternalId: "at://me/p/root" });
    expect(mapNotification(notif({}))).toMatchObject({ kind: "MENTION", authorName: "Ann", authorHandle: "ann.bsky.social" });
    expect(mapNotification(notif({ reason: "like" }))).toBeNull();
  });

  it("fetches notifications, stops at `since`, adds root excerpts", async () => {
    const calls = mockFetch((url) => {
      if (url.pathname.endsWith("listNotifications"))
        return {
          notifications: [
            notif({ reason: "reply", uri: "at://did:plc:a/app.bsky.feed.post/2", record: { text: "nice", createdAt: "2026-10-02T00:00:00Z", reply: { root: { uri: "at://did:plc:me/app.bsky.feed.post/r", cid: "r" }, parent: { uri: "at://did:plc:me/app.bsky.feed.post/r", cid: "r" } } }, indexedAt: "2026-10-02T00:00:00Z" }),
            notif({ reason: "like", indexedAt: "2026-10-02T00:00:00Z" }),
            notif({ indexedAt: "2026-09-01T00:00:00Z" }),
          ],
          cursor: "next",
        };
      if (url.pathname.endsWith("getPosts")) return { posts: [{ uri: "at://did:plc:me/app.bsky.feed.post/r", cid: "r", record: { text: "Our new launch" } }] };
      throw new Error(`unexpected ${url}`);
    });
    const items = await getInboxProvider("BLUESKY")!.fetch(bskyCreds, {}, new Date("2026-09-15T00:00:00Z"));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "COMMENT", text: "nice", postExcerpt: "Our new launch" });
    expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe(`Bearer ${jwt}`);
    expect(calls.filter((c) => c.url.pathname.endsWith("listNotifications"))).toHaveLength(1);
  });

  it("replies with root/parent refs", async () => {
    const calls = mockFetch((url) => {
      if (url.pathname.endsWith("getPosts"))
        return { posts: [{ uri: "at://a/p/2", cid: "c2", record: { text: "q?", reply: { root: { uri: "at://me/p/1", cid: "c1" }, parent: { uri: "at://me/p/1", cid: "c1" } } } }] };
      if (url.pathname.endsWith("createRecord")) return { uri: "at://me/p/3", cid: "c3" };
      return {};
    });
    const r = await getInboxProvider("BLUESKY")!.reply(bskyCreds, {}, { kind: "COMMENT", externalId: "at://a/p/2", conversationExternalId: "x" }, "Thanks!");
    expect(r.externalId).toBe("at://me/p/3");
    const body = JSON.parse(String(calls.find((c) => c.url.pathname.endsWith("createRecord"))!.init.body));
    expect(body.record.reply).toEqual({ root: { uri: "at://me/p/1", cid: "c1" }, parent: { uri: "at://a/p/2", cid: "c2" } });
  });
});

describe("mastodon inbox", () => {
  const acct = { id: "9", acct: "bob@x.social", username: "bob", display_name: "Bob" };
  const status = (over: Record<string, unknown>) => ({
    id: "100",
    content: "<p>hello</p>",
    created_at: "2026-10-02T00:00:00Z",
    uri: "u",
    url: "https://x/100",
    visibility: "public",
    account: acct,
    ...over,
  });

  it("classifies DM / COMMENT / MENTION", () => {
    const n = (s: Record<string, unknown>) => ({ id: "1", type: "mention", created_at: "2026-10-02T00:00:00Z", account: acct, status: status(s) });
    expect(mapMastodon(n({ visibility: "direct" }), "me")).toMatchObject({ kind: "DM", conversationExternalId: "dm:9", text: "hello" });
    expect(mapMastodon(n({ in_reply_to_id: "50", in_reply_to_account_id: "me" }), "me")).toMatchObject({ kind: "COMMENT", postExternalId: "50", conversationExternalId: "50:9" });
    expect(mapMastodon(n({}), "me")).toMatchObject({ kind: "MENTION", conversationExternalId: "100:9" });
    expect(mapMastodon({ id: "2", type: "favourite", created_at: "", account: acct }, "me")).toBeNull();
  });

  it("fetches mentions with thread roots and replies with an @mention", async () => {
    const calls = mockFetch((url, init) => {
      if (url.pathname === "/api/v1/notifications")
        return [{ id: "1", type: "mention", created_at: "2026-10-02T00:00:00Z", account: acct, status: status({ in_reply_to_id: "77", in_reply_to_account_id: "9" }) }];
      if (url.pathname.endsWith("/context")) return { ancestors: [status({ id: "50", content: "<p>Our post</p>", account: { ...acct, id: "me" } })] };
      if (url.pathname === "/api/v1/statuses" && init.method === "POST") return status({ id: "200" });
      return {};
    });
    const p = getInboxProvider("MASTODON")!;
    const creds = { instanceUrl: "https://m.test", accessToken: "t" };
    const items = await p.fetch(creds, { externalId: "me" });
    expect(items[0]).toMatchObject({ kind: "COMMENT", postExternalId: "50", postExcerpt: "Our post" });
    expect(calls[0]!.url.searchParams.getAll("types[]")).toEqual(["mention"]);
    const r = await p.reply(creds, {}, { kind: "COMMENT", externalId: "100", conversationExternalId: "50:9", authorHandle: "bob@x.social" }, "Thanks");
    expect(r.externalId).toBe("200");
    const body = JSON.parse(String(calls.at(-1)!.init.body));
    expect(body).toMatchObject({ status: "@bob@x.social Thanks", in_reply_to_id: "100", visibility: "public" });
  });
});

describe("meta inbox (pending review)", () => {
  it("maps conversations and IG comment threads", () => {
    const items = mapConversation(
      {
        id: "t_1",
        messages: {
          data: [
            { id: "m2", message: "Thanks!", created_time: "2026-10-02T00:00:00Z", from: { id: "page", name: "Brand" } },
            { id: "m1", message: "Do you ship to Canada?", created_time: "2026-10-01T00:00:00Z", from: { id: "u1", name: "Cara" } },
          ],
        },
      },
      "page",
    );
    expect(items.map((i) => [i.direction, i.authorName])).toEqual([
      ["OUT", "Brand"],
      ["IN", "Cara"],
    ]);
    const ig = mapIgComments(
      { id: "media1", caption: "Fall drop" },
      [{ id: "c1", text: "Price?", timestamp: "2026-10-01T00:00:00Z", username: "dee", replies: { data: [{ id: "c2", text: "$20", timestamp: "2026-10-01T01:00:00Z", from: { id: "ig" } }] } }],
      "ig",
    );
    expect(ig).toMatchObject([
      { conversationExternalId: "c1", direction: "IN", postExcerpt: "Fall drop" },
      { conversationExternalId: "c1", direction: "OUT" },
    ]);
  });

  it("fetches Facebook DMs/comments/mentions and replies to comments", async () => {
    vi.stubEnv("META_APP_ID", "1");
    const calls = mockFetch((url, init) => {
      const p = url.pathname.replace("/v21.0", "");
      if (p === "/page/conversations")
        return { data: [{ id: "t_1", messages: { data: [{ id: "m1", message: "Hi", created_time: "2026-10-01T00:00:00Z", from: { id: "u1", name: "Cara" } }] } }] };
      if (p === "/page/published_posts") return { data: [{ id: "page_1", message: "Launch day" }] };
      if (p === "/page_1/comments" && !init.method) return { data: [{ id: "c1", message: "Congrats", created_time: "2026-10-01T00:00:00Z", from: { id: "u2", name: "Dan" } }] };
      if (p === "/page/tagged") return { data: [] };
      if (p === "/c1/comments") return { id: "c9" };
      return { data: [] };
    });
    const p = getInboxProvider("FACEBOOK")!;
    const items = await p.fetch({ accessToken: "tok" }, { externalId: "page" });
    expect(items.map((i) => i.kind)).toEqual(["DM", "COMMENT"]);
    expect(calls[0]!.url.searchParams.get("access_token")).toBe("tok");
    const r = await p.reply({ accessToken: "tok" }, { externalId: "page" }, { kind: "COMMENT", externalId: "c1", conversationExternalId: "c1" }, "Thank you!");
    expect(r.externalId).toBe("c9");
  });
});

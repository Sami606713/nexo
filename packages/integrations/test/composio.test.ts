import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdapterError, type ComposedPost } from "@postline/core";
import { availableNetworks, channelVia, connectVia, getAdapter } from "../src/index";
import { ComposioError, toAdapterError } from "../src/composio/api";
import { createComposioAdapter, discoverTargets, publicMediaUrl } from "../src/composio/adapter";

type Call = { url: string; body: Record<string, unknown> | undefined };
let calls: Call[];

/** Route Composio REST calls by path/tool slug to canned responses. */
function mockComposio(responses: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ url, body });
      const key = Object.keys(responses).find((k) => url.includes(k));
      if (!key) return new Response(JSON.stringify({ error: { message: `unmocked ${url}` } }), { status: 404 });
      return new Response(JSON.stringify(responses[key]), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
}

const ok = (data: unknown) => ({ successful: true, error: null, data });
const creds = { composioAccountId: "ca_1", composioUserId: "brand_b1" };
const post = (over: Partial<ComposedPost> = {}): ComposedPost => ({ postId: "p1", caption: "Hello world", media: [], options: {}, channelExtras: {}, ...over });

beforeEach(() => {
  process.env.COMPOSIO_API_KEY = "ak_test";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.COMPOSIO_API_KEY;
  delete process.env.COMPOSIO_AUTH_CONFIG_TWITTER;
  delete process.env.X_CLIENT_ID;
  delete process.env.ENABLE_NATIVE_CHANNELS;
});

describe("registry", () => {
  it("offers only Composio networks by default", () => {
    const nets = availableNetworks();
    expect([...nets].sort()).toEqual(["FACEBOOK", "INSTAGRAM", "LINKEDIN", "NOTION", "PINTEREST", "REDDIT", "SLACK", "YOUTUBE"]);
    expect(connectVia("INSTAGRAM")).toBe("composio");
    expect(connectVia("BLUESKY")).toBeUndefined();
  });

  it("offers native adapters again with ENABLE_NATIVE_CHANNELS=1", () => {
    process.env.ENABLE_NATIVE_CHANNELS = "1";
    expect(availableNetworks()).toEqual(expect.arrayContaining(["BLUESKY", "MASTODON", "CUSTOM_WEBHOOK", "INSTAGRAM"]));
    expect(connectVia("BLUESKY")).toBe("native");
  });

  it("offers X only with an auth config, and prefers a native app when configured", () => {
    process.env.COMPOSIO_AUTH_CONFIG_TWITTER = "ac_x";
    expect(connectVia("X")).toBe("composio");
    process.env.X_CLIENT_ID = "native-client";
    expect(connectVia("X")).toBe("composio");
    process.env.ENABLE_NATIVE_CHANNELS = "1";
    expect(connectVia("X")).toBe("native");
  });

  it("serves existing channels by how they were connected", () => {
    expect(channelVia({ extras: { via: "composio" } })).toBe("composio");
    expect(channelVia({ extras: {} })).toBe("native");
    expect(getAdapter("LINKEDIN", { extras: { via: "composio" } })?.getAuthorizeUrl).toBeUndefined();
    expect(getAdapter("LINKEDIN", { extras: {} })?.getAuthorizeUrl).toBeTypeOf("function");
    expect(getAdapter("BLUESKY", { extras: {} })?.network).toBe("BLUESKY");
  });

  it("offers nothing through Composio without an API key", () => {
    delete process.env.COMPOSIO_API_KEY;
    expect(availableNetworks()).not.toContain("INSTAGRAM");
  });
});

describe("error mapping", () => {
  it("maps Composio failures to adapter error kinds", () => {
    expect(toAdapterError(new ComposioError("rate limit exceeded", 429), "x").kind).toBe("rate_limit");
    expect(toAdapterError(new ComposioError("Connected account is EXPIRED"), "x").kind).toBe("auth");
    expect(toAdapterError(new ComposioError("boom", 502), "x").kind).toBe("transient");
    expect(toAdapterError(new ComposioError("Couldn't reach Composio: ECONNRESET"), "x").kind).toBe("transient");
    expect(toAdapterError(new ComposioError("Caption too long", 400), "x").kind).toBe("rejected");
  });
});

describe("validation", () => {
  const img = { url: "https://cdn.example.com/a.jpg", mime: "image/jpeg" };
  it("allows LinkedIn images but blocks YouTube uploads", () => {
    expect(createComposioAdapter("LINKEDIN").validate(post({ media: [img] }))).toEqual([]);
    expect(createComposioAdapter("YOUTUBE").validate(post()).some((i) => i.level === "error")).toBe(true);
  });
  it("rewrites local media onto PUBLIC_MEDIA_BASE_URL", () => {
    const local = { url: "http://localhost:3000/uploads/b1/a.jpg", mime: "image/jpeg" };
    process.env.PUBLIC_MEDIA_BASE_URL = "https://media.example.com/";
    try {
      expect(publicMediaUrl(local.url)).toBe("https://media.example.com/uploads/b1/a.jpg");
      expect(publicMediaUrl("https://cdn.example.com/x.jpg")).toBe("https://cdn.example.com/x.jpg");
      expect(createComposioAdapter("INSTAGRAM").validate(post({ media: [local] })).filter((i) => i.level === "error")).toEqual([]);
    } finally {
      delete process.env.PUBLIC_MEDIA_BASE_URL;
    }
  });
  it("requires public media URLs for Instagram", () => {
    const local = { url: "http://localhost:3000/uploads/a.jpg", mime: "image/jpeg" };
    expect(createComposioAdapter("INSTAGRAM").validate(post({ media: [local] })).some((i) => i.message.includes("public URL"))).toBe(true);
    expect(createComposioAdapter("INSTAGRAM").validate(post({ media: [img] })).filter((i) => i.level === "error")).toEqual([]);
  });
  it("does not require a Pinterest board option (it comes from the account)", () => {
    expect(createComposioAdapter("PINTEREST").validate(post({ media: [img] })).filter((i) => i.level === "error")).toEqual([]);
  });
});

describe("discoverTargets", () => {
  it("lists Facebook Pages as separate channels", async () => {
    mockComposio({
      "/connected_accounts/ca_1": { id: "ca_1", status: "ACTIVE" },
      "FACEBOOK_GET_USER_PAGES": ok({ response_data: { data: [{ id: "111", name: "Acme" }, { id: "222", name: "Acme Shop" }] } }),
    });
    const t = await discoverTargets("FACEBOOK", "ca_1", "brand_b1");
    expect(t.map((x) => [x.externalId, x.name, x.credentials.pageId])).toEqual([
      ["111", "Acme", "111"],
      ["222", "Acme Shop", "222"],
    ]);
    expect(t[0]!.extras).toMatchObject({ via: "composio", composioAccountId: "ca_1" });
  });

  it("builds the LinkedIn author URN", async () => {
    mockComposio({
      "/connected_accounts/ca_1": { id: "ca_1", status: "ACTIVE" },
      "LINKEDIN_GET_MY_INFO": ok({ response_dict: { author_id: "abc123", name: "Sam Lee" } }),
    });
    const [t] = await discoverTargets("LINKEDIN", "ca_1", "brand_b1");
    expect(t!.credentials.authorUrn).toBe("urn:li:person:abc123");
    expect(t!.name).toBe("Sam Lee");
  });

  it("reads LinkedIn /v2/me-shaped profiles", async () => {
    mockComposio({
      "/connected_accounts/ca_1": { id: "ca_1", status: "ACTIVE" },
      "LINKEDIN_GET_MY_INFO": ok({ id: "SqE1", localizedFirstName: "Sam", localizedLastName: "Ullah", vanityName: "samullah", profilePicture: { displayImage: "urn:li:digitalmediaAsset:x" } }),
    });
    const [t] = await discoverTargets("LINKEDIN", "ca_1", "brand_b1");
    expect(t).toMatchObject({ externalId: "urn:li:person:SqE1", name: "Sam Ullah", username: "samullah" });
  });

  it("rejects inactive connections", async () => {
    mockComposio({ "/connected_accounts/ca_1": { id: "ca_1", status: "FAILED" } });
    await expect(discoverTargets("INSTAGRAM", "ca_1", "brand_b1")).rejects.toBeInstanceOf(AdapterError);
  });
});

describe("publish", () => {
  /** Proxy calls all hit one URL; answer by the proxied endpoint. */
  function mockProxy(answer: (endpoint: string, method: string) => { status: number; data?: unknown; headers?: Record<string, string> }) {
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.includes("composio.dev")) return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } });
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        calls.push({ url, body });
        return new Response(JSON.stringify(answer(String(body.endpoint), String(body.method))), { status: 200 });
      }),
    );
  }

  it("posts to LinkedIn with images via the proxy (upload, then Posts API)", async () => {
    mockProxy((endpoint) =>
      endpoint.includes("initializeUpload")
        ? { status: 200, data: { value: { uploadUrl: "https://www.linkedin.com/dms-uploads/x", image: "urn:li:image:I1" } } }
        : endpoint.includes("dms-uploads")
          ? { status: 201, data: null }
          : { status: 201, data: null, headers: { "X-RestLi-Id": "urn:li:share:7311" } },
    );
    const r = await createComposioAdapter("LINKEDIN").publish(post({ media: [{ url: "http://localhost:3000/uploads/a.png", mime: "image/png", alt: "A" }] }), {
      ...creds,
      authorUrn: "urn:li:person:abc",
    });
    expect(r.externalId).toBe("urn:li:share:7311");
    expect(calls.map((c) => c.body!.method)).toEqual(["POST", "PUT", "POST"]);
    expect(calls[1]!.body!.binary_body).toMatchObject({ content_type: "image/png" });
    expect(calls[2]!.body!.body).toMatchObject({ author: "urn:li:person:abc", commentary: "Hello world", content: { media: { id: "urn:li:image:I1", altText: "A" } } });
  });

  it("keeps the raw LinkedIn response when no post id comes back", async () => {
    mockProxy(() => ({ status: 201, data: { odd: true } }));
    await expect(createComposioAdapter("LINKEDIN").publish(post(), { ...creds, authorUrn: "urn:li:person:abc" })).rejects.toMatchObject({
      kind: "unknown",
      details: { body: expect.stringContaining("odd") },
    });
  });

  it("maps LinkedIn proxy errors (401 → auth)", async () => {
    mockProxy(() => ({ status: 401, data: { message: "Invalid access token" } }));
    await expect(createComposioAdapter("LINKEDIN").publish(post(), { ...creds, authorUrn: "urn:li:person:abc" })).rejects.toMatchObject({ kind: "auth" });
  });

  it("publishes an Instagram photo via container + publish", async () => {
    mockComposio({
      "INSTAGRAM_CREATE_MEDIA_CONTAINER": ok({ id: "cont1" }),
      "INSTAGRAM_CREATE_POST": ok({ id: "media9" }),
    });
    const r = await createComposioAdapter("INSTAGRAM").publish(
      post({ media: [{ url: "https://cdn.example.com/a.jpg", mime: "image/jpeg" }] }),
      { ...creds, igUserId: "17841", username: "acme" },
    );
    expect(r).toMatchObject({ externalId: "media9", url: "https://www.instagram.com/acme/" });
    expect(calls.map((c) => c.url.split("/").pop())).toEqual(["INSTAGRAM_CREATE_MEDIA_CONTAINER", "INSTAGRAM_CREATE_POST"]);
  });

  it("threads long X posts as replies", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        calls.push({ url: String(_u), body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify(ok({ data: { id: `t${++n}` } })), { status: 200 });
      }),
    );
    calls = [];
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} about coffee.`).join(" ");
    const r = await createComposioAdapter("X").publish(post({ caption: long }), { ...creds, username: "acme" });
    expect(r.partIds!.length).toBeGreaterThan(1);
    expect((calls[1]!.body!.arguments as Record<string, unknown>).reply__in__reply__to__tweet__id).toBe("t1");
  });

  it("submits Reddit text posts with the first line as title", async () => {
    mockComposio({ "REDDIT_CREATE_REDDIT_POST": ok({ json: { data: { name: "t3_abc", url: "https://www.reddit.com/r/coffee/comments/abc/x/" } } }) });
    const r = await createComposioAdapter("REDDIT").publish(post({ caption: "Fresh beans\nRoasted today.", options: { subreddit: "r/coffee" } }), creds);
    expect(r).toEqual({ externalId: "t3_abc", url: "https://www.reddit.com/r/coffee/comments/abc/x/" });
    expect(calls[0]!.body!.arguments).toMatchObject({ subreddit: "coffee", title: "Fresh beans", kind: "self", text: "Roasted today." });
  });

  it("posts Slack messages and deletes them by channel:ts", async () => {
    mockComposio({ "SLACK_CHAT_POST_MESSAGE": ok({ ok: true, ts: "1700.01", channel: "C1" }), "SLACK_DELETES_A_MESSAGE_FROM_A_CHAT": ok({ ok: true }) });
    const a = createComposioAdapter("SLACK");
    const r = await a.publish(post(), { ...creds, slackChannelId: "C1" });
    expect(r.externalId).toBe("C1:1700.01");
    await a.delete!("C1:1700.01", creds, {});
    expect(calls[1]!.body!.arguments).toEqual({ channel: "C1", ts: "1700.01" });
  });

  it("creates a Notion page with paragraphs under the parent", async () => {
    mockComposio({ "NOTION_CREATE_NOTION_PAGE": ok({ id: "pg-1", url: "https://www.notion.so/pg1" }), "NOTION_ADD_MULTIPLE_PAGE_CONTENT": ok({}) });
    const r = await createComposioAdapter("NOTION").publish(post({ caption: "Launch notes\n\nPara one.\n\nPara two." }), { ...creds, notionParentId: "parent-1" });
    expect(r).toEqual({ externalId: "pg-1", url: "https://www.notion.so/pg1" });
    expect(calls[0]!.body!.arguments).toMatchObject({ parent_id: "parent-1", title: "Launch notes" });
    expect((calls[1]!.body!.arguments as { content_blocks: unknown[] }).content_blocks).toHaveLength(2);
  });

  it("surfaces tool failures as adapter errors", async () => {
    mockComposio({ "FACEBOOK_CREATE_POST": { successful: false, error: "Connected account is EXPIRED", data: {} } });
    await expect(createComposioAdapter("FACEBOOK").publish(post(), { ...creds, pageId: "111" })).rejects.toMatchObject({ kind: "auth" });
  });
});

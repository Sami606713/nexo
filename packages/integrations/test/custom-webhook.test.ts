import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComposedPost } from "@postline/core";
import { createCustomWebhookAdapter } from "../src/adapters/custom-webhook";

const PUBLIC = async () => [{ address: "93.184.216.34", family: 4 }];
const adapter = createCustomWebhookAdapter({ lookupFn: PUBLIC });
const creds = { endpointUrl: "https://hooks.test/publish", headerName: "X-Secret", headerValue: "s3cret" };
const post: ComposedPost = {
  postId: "post_1",
  caption: "Hello world",
  media: [{ url: "https://cdn.test/a.jpg", mime: "image/jpeg", alt: "A" }],
  options: { foo: 1 },
  channelExtras: {},
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

describe("custom webhook publish", () => {
  it("POSTs the documented payload with secret + idempotency headers", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { id: "ext-1", url: "https://site.test/p/1" }));
    const r = await adapter.publish(post, creds);
    expect(r).toEqual({ externalId: "ext-1", url: "https://site.test/p/1" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.test/publish");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    const h = new Headers(init.headers);
    expect(h.get("x-secret")).toBe("s3cret");
    expect(h.get("idempotency-key")).toBe("post_1");
    expect(JSON.parse(String(init.body))).toEqual({
      event: "post.published",
      post: { id: "post_1", caption: "Hello world", media: post.media, options: { foo: 1 } },
    });
  });

  it("rejects 2xx responses without {id, url}", async () => {
    fetchMock.mockResolvedValueOnce(json(200, "ok"));
    await expect(adapter.publish(post, creds)).rejects.toMatchObject({ kind: "rejected", details: { status: 200, body: "ok" } });
  });

  it("maps 4xx → rejected, 5xx → transient, 429 → rate_limit, 401 → auth", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { error: "nope" }));
    await expect(adapter.publish(post, creds)).rejects.toMatchObject({ kind: "rejected", details: { status: 400 } });
    fetchMock.mockResolvedValueOnce(json(502, "bad gateway"));
    await expect(adapter.publish(post, creds)).rejects.toMatchObject({ kind: "transient" });
    fetchMock.mockResolvedValueOnce(json(429, {}, { "retry-after": "5" }));
    await expect(adapter.publish(post, creds)).rejects.toMatchObject({ kind: "rate_limit", details: { retryAfterSec: 5 } });
    fetchMock.mockResolvedValueOnce(json(401, {}));
    await expect(adapter.publish(post, creds)).rejects.toMatchObject({ kind: "auth" });
  });

  it("timeout after sending → unknown", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
    await expect(adapter.publish(post, creds)).rejects.toMatchObject({ kind: "unknown" });
  });

  it("follows redirects preserving POST, up to 3", async () => {
    fetchMock
      .mockResolvedValueOnce(json(302, "", { location: "/v2/publish" }))
      .mockResolvedValueOnce(json(200, { id: "x", url: "u" }));
    await adapter.publish(post, creds);
    const [url2, init2] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url2).toBe("https://hooks.test/v2/publish");
    expect(init2.method).toBe("POST");
    expect(JSON.parse(String(init2.body)).event).toBe("post.published");

    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => json(307, "", { location: "https://hooks.test/loop" }));
    await expect(adapter.publish(post, creds)).rejects.toMatchObject({ kind: "rejected" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("re-checks SSRF on redirect targets", async () => {
    fetchMock.mockResolvedValueOnce(json(301, "", { location: "http://169.254.169.254/latest" }));
    await expect(adapter.publish(post, creds)).rejects.toMatchObject({ kind: "rejected" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("custom webhook delete & connect", () => {
  it("sends post.deleted to deleteUrl; 404/410 count as success", async () => {
    fetchMock.mockResolvedValueOnce(json(404, {}));
    await adapter.delete!("ext-1", { ...creds, deleteUrl: "https://hooks.test/delete" }, {});
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.test/delete");
    expect(JSON.parse(String(init.body))).toMatchObject({ event: "post.deleted", id: "ext-1" });
    fetchMock.mockResolvedValueOnce(json(410, {}));
    await expect(adapter.delete!("ext-1", creds, {})).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(json(500, {}));
    await expect(adapter.delete!("ext-1", creds, {})).rejects.toMatchObject({ kind: "transient" });
  });

  it("connect refuses private endpoints", async () => {
    const priv = createCustomWebhookAdapter({ lookupFn: async () => [{ address: "10.0.0.5", family: 4 }] });
    await expect(priv.connectWithCredentials!({ endpointUrl: "https://internal.test/hook" })).rejects.toMatchObject({ kind: "rejected" });
    const [t] = await adapter.connectWithCredentials!({ endpointUrl: "https://hooks.test/publish" });
    expect(t).toMatchObject({ network: "CUSTOM_WEBHOOK", name: "hooks.test", credentials: { endpointUrl: "https://hooks.test/publish" } });
  });
});

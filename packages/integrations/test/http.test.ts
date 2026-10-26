import { afterEach, describe, expect, it, vi } from "vitest";
import { AdapterError } from "@postline/core";
import { downloadMedia, fetchJson, networkError, parseRetryAfter } from "../src/http";

afterEach(() => vi.unstubAllGlobals());

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers })));

async function kindOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AdapterError);
    return e as AdapterError;
  }
  throw new Error("expected rejection");
}

describe("error mapping", () => {
  it("401 → auth", async () => {
    respond(401, { error: "invalid token" });
    expect((await kindOf(fetchJson("https://api.test/x"))).kind).toBe("auth");
  });
  it("429 → rate_limit with retryAfterSec", async () => {
    respond(429, {}, { "retry-after": "42" });
    const e = await kindOf(fetchJson("https://api.test/x"));
    expect(e.kind).toBe("rate_limit");
    expect(e.details?.retryAfterSec).toBe(42);
  });
  it("5xx → transient, 4xx → rejected with status/body", async () => {
    respond(503, "down");
    expect((await kindOf(fetchJson("https://api.test/x"))).kind).toBe("transient");
    respond(422, { error: "bad content" });
    const e = await kindOf(fetchJson("https://api.test/x", { method: "POST" }));
    expect(e.kind).toBe("rejected");
    expect(e.details?.status).toBe(422);
    expect(e.message).toContain("bad content");
  });
  it("per-network classify overrides", async () => {
    respond(403, {});
    expect((await kindOf(fetchJson("https://api.test/x", { classify: () => "auth" }))).kind).toBe("auth");
  });
  it("timeouts: unknown for POST, transient for GET", () => {
    const t = Object.assign(new Error("timeout"), { name: "TimeoutError" });
    expect(networkError(t, false).kind).toBe("unknown");
    expect(networkError(t, true).kind).toBe("transient");
  });
  it("connection refused is transient even for POST", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
    }));
    expect((await kindOf(fetchJson("https://api.test/x", { method: "POST" }))).kind).toBe("transient");
  });
});

describe("parseRetryAfter", () => {
  const now = 1_700_000_000_000;
  it("handles epoch resets, ISO dates and bodies", () => {
    expect(parseRetryAfter(new Headers({ "x-rate-limit-reset": String(now / 1000 + 30) }), undefined, now)).toBe(30);
    expect(parseRetryAfter(new Headers({ "x-ratelimit-reset": new Date(now + 10_000).toISOString() }), undefined, now)).toBe(10);
    expect(parseRetryAfter(new Headers(), { parameters: { retry_after: 7 } }, now)).toBe(7);
    expect(parseRetryAfter(new Headers(), { retry_after: 1.2 }, now)).toBe(2);
  });
});

describe("downloadMedia", () => {
  it("enforces the size cap", async () => {
    respond(200, "x".repeat(2000), { "content-type": "image/png" });
    await expect(downloadMedia("https://cdn.test/a.png", { maxBytes: 1000 })).rejects.toMatchObject({ kind: "rejected" });
    respond(200, "x".repeat(500), { "content-type": "image/png" });
    const m = await downloadMedia("https://cdn.test/a.png", { maxBytes: 1000 });
    expect(m).toMatchObject({ size: 500, mime: "image/png", filename: "a.png" });
  });
});

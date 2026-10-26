import { describe, expect, it } from "vitest";
import { AdapterError } from "@postline/core";
import { classifyFailure, computeBackoffMs } from "../src/lib/failure";

describe("classifyFailure", () => {
  it("auth → reconnect, no retry", () => {
    const r = classifyFailure(new AdapterError("auth", "token revoked"), 0, 5);
    expect(r.action).toBe("reconnect");
    expect(r.error.kind).toBe("auth");
  });

  it("rejected → fail", () => {
    const r = classifyFailure(new AdapterError("rejected", "duplicate", { status: 403 }), 0, 5);
    expect(r).toMatchObject({ action: "fail", error: { kind: "rejected", message: "duplicate", details: { status: 403 } } });
  });

  it("unknown → fail with may-have-published warning", () => {
    const r = classifyFailure(new AdapterError("unknown", "timeout after send"), 0, 5);
    expect(r.action).toBe("fail");
    expect(r.error.message).toContain("may have published — check the network before retrying");
  });

  it("transient retries until the last attempt", () => {
    expect(classifyFailure(new AdapterError("transient", "502"), 0, 5).action).toBe("retry");
    expect(classifyFailure(new AdapterError("transient", "502"), 3, 5).action).toBe("retry");
    const last = classifyFailure(new AdapterError("transient", "502"), 4, 5);
    expect(last.action).toBe("fail");
    expect(last.error.kind).toBe("transient");
  });

  it("rate_limit carries retryAfter delay", () => {
    const r = classifyFailure(new AdapterError("rate_limit", "429", { retryAfterSec: 90 }), 1, 5);
    expect(r).toMatchObject({ action: "retry", delayMs: 90_000 });
  });

  it("non-AdapterError is treated as transient", () => {
    expect(classifyFailure(new TypeError("fetch failed"), 0, 5)).toMatchObject({ action: "retry", error: { kind: "transient" } });
    expect(classifyFailure("boom", 4, 5)).toMatchObject({ action: "fail", error: { kind: "transient" } });
  });

  it("duck-types AdapterError from another module instance", () => {
    const fake = Object.assign(new Error("x"), { name: "AdapterError", kind: "auth" });
    expect(classifyFailure(fake, 0, 5).action).toBe("reconnect");
  });

  it("single-attempt jobs never retry", () => {
    expect(classifyFailure(new AdapterError("transient", "x"), 0, 1).action).toBe("fail");
  });
});

describe("computeBackoffMs", () => {
  it("exponential from 30s", () => {
    expect(computeBackoffMs(1, new Error("x"))).toBe(30_000);
    expect(computeBackoffMs(2, new Error("x"))).toBe(60_000);
    expect(computeBackoffMs(4, new Error("x"))).toBe(240_000);
  });
  it("honours retryAfterSec, capped at 1h", () => {
    expect(computeBackoffMs(1, new AdapterError("rate_limit", "429", { retryAfterSec: 15 }))).toBe(15_000);
    expect(computeBackoffMs(1, new AdapterError("rate_limit", "429", { retryAfterSec: 99_999 }))).toBe(3600_000);
  });
});

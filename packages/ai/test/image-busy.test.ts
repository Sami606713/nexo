import { describe, expect, it } from "vitest";
import { ImageBusyError, withBusyRetry } from "../src/images";

const res = (status: number, headers: Record<string, string> = {}) => new Response(status === 200 ? "{}" : null, { status, headers });

describe("withBusyRetry", () => {
  it("retries while busy, then returns the good response", async () => {
    const seq = [429, 503, 200];
    let calls = 0;
    const r = await withBusyRetry(async () => res(seq[calls++]!), [0, 0]);
    expect(r.status).toBe(200);
    expect(calls).toBe(3);
  });

  it("gives up with ImageBusyError after the last retry", async () => {
    let calls = 0;
    await expect(withBusyRetry(async () => (calls++, res(429)), [0, 0])).rejects.toBeInstanceOf(ImageBusyError);
    expect(calls).toBe(3);
  });

  it("does not retry other errors", async () => {
    let calls = 0;
    const r = await withBusyRetry(async () => (calls++, res(400)), [0, 0]);
    expect(r.status).toBe(400);
    expect(calls).toBe(1);
  });

  it("honours Retry-After (capped)", async () => {
    const seq = [res(429, { "retry-after": "0.01" }), res(200)];
    const t = Date.now();
    const r = await withBusyRetry(async () => seq.shift()!, [60_000]);
    expect(r.status).toBe(200);
    expect(Date.now() - t).toBeLessThan(1_000);
  });
});

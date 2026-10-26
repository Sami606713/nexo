import { afterEach, describe, expect, it, vi } from "vitest";
import { deletionOrder } from "../src/util";
import { xAdapter } from "../src/adapters/x";
import { mastodonAdapter } from "../src/adapters/mastodon";

afterEach(() => vi.unstubAllGlobals());

describe("deleting threads", () => {
  it("orders replies first, root last, deduped; falls back to externalId", () => {
    expect(deletionOrder("1", ["1", "2", "3"])).toEqual(["3", "2", "1"]);
    expect(deletionOrder("1", undefined)).toEqual(["1"]);
    expect(deletionOrder("1", ["2"])).toEqual(["2", "1"]);
  });

  it("X deletes every part and treats 404 as done", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response("{}", { status: url.endsWith("/2") ? 404 : 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await xAdapter.delete!("1", { accessToken: "t" }, {}, ["1", "2", "3"]);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "https://api.x.com/2/tweets/3",
      "https://api.x.com/2/tweets/2",
      "https://api.x.com/2/tweets/1",
    ]);
  });

  it("Mastodon deletes every part", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await mastodonAdapter.delete!("10", { instanceUrl: "https://m.test", accessToken: "t" }, {}, ["10", "11"]);
    expect(fetchMock.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      "https://m.test/api/v1/statuses/11",
      "https://m.test/api/v1/statuses/10",
    ]);
  });
});

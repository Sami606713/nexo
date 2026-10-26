import { describe, expect, it } from "vitest";
import { appendHashtags, blockingIssues, composePost } from "../src/lib/compose";

const asset = (url: string, extra: Partial<{ width: number; alt: string; duration: number }> = {}) => ({
  url,
  mime: "image/png",
  width: extra.width ?? null,
  height: null,
  sizeBytes: 1000,
  duration: extra.duration ?? null,
  alt: extra.alt ?? null,
});

describe("composePost", () => {
  const base = {
    post: { id: "p1", captionOverride: null as string | null },
    group: { caption: "Shared caption", options: { INSTAGRAM: { placement: "reel" }, X: { replySettings: "following" } } },
    channel: { network: "INSTAGRAM", extras: { igUserId: "123" } },
    media: [
      { position: 2, media: asset("c.png") },
      { position: 0, media: asset("a.png", { width: 1080, alt: "A" }) },
      { position: 1, media: asset("b.png") },
    ],
  };

  it("uses group caption, network options, extras and media order", () => {
    const c = composePost(base);
    expect(c).toEqual({
      postId: "p1",
      caption: "Shared caption",
      options: { placement: "reel" },
      channelExtras: { igUserId: "123" },
      media: [
        { url: "a.png", mime: "image/png", width: 1080, sizeBytes: 1000, alt: "A" },
        { url: "b.png", mime: "image/png", sizeBytes: 1000 },
        { url: "c.png", mime: "image/png", sizeBytes: 1000 },
      ],
    });
  });

  it("captionOverride wins (even empty string)", () => {
    expect(composePost({ ...base, post: { id: "p1", captionOverride: "Short X" } }).caption).toBe("Short X");
    expect(composePost({ ...base, post: { id: "p1", captionOverride: "" } }).caption).toBe("");
  });

  it("missing/garbage options and extras → {}", () => {
    const c = composePost({ ...base, group: { caption: "x", options: null }, channel: { network: "BLUESKY", extras: [] } });
    expect(c.options).toEqual({});
    expect(c.channelExtras).toEqual({});
    const d = composePost({ ...base, group: { caption: "x", options: { BLUESKY: "nope" } }, channel: { network: "BLUESKY", extras: null } });
    expect(d.options).toEqual({});
  });

  it("maps duration → durationSec", () => {
    const c = composePost({ ...base, media: [{ position: 0, media: { ...asset("v.mp4", { duration: 12.5 }), mime: "video/mp4" } }] });
    expect(c.media[0]).toMatchObject({ durationSec: 12.5, mime: "video/mp4" });
  });
});

describe("blockingIssues", () => {
  it("keeps only errors", () => {
    expect(
      blockingIssues([
        { level: "warning", code: "will_thread", message: "w" },
        { level: "error", code: "caption_too_long", message: "e" },
      ]),
    ).toEqual([{ level: "error", code: "caption_too_long", message: "e" }]);
  });
});

describe("appendHashtags", () => {
  it("appends missing tags, normalising #", () => {
    expect(appendHashtags("Hello world", ["marketing", "#AI"])).toBe("Hello world\n\n#marketing #AI");
  });
  it("skips tags already present (case-insensitive, whole tag)", () => {
    expect(appendHashtags("Love #ai today", ["#AI", "aiart"])).toBe("Love #ai today\n\n#aiart");
    expect(appendHashtags("Love #aiart", ["ai"])).toBe("Love #aiart\n\n#ai");
  });
  it("no-ops on empty input and dedupes", () => {
    expect(appendHashtags("x", [])).toBe("x");
    expect(appendHashtags("x", undefined)).toBe("x");
    expect(appendHashtags("x", ["a", "#A", " "])).toBe("x\n\n#a");
  });
});

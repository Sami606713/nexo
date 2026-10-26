import { describe, expect, it } from "vitest";
import { countCharacters, validateAgainstLimits, type MediaItem } from "@postline/core";
import { validateForNetwork } from "../src/client";

const img = (extra: Partial<MediaItem> = {}): MediaItem => ({ url: "https://cdn.example.com/a.jpg", mime: "image/jpeg", ...extra });
const vid = (extra: Partial<MediaItem> = {}): MediaItem => ({ url: "https://cdn.example.com/a.mp4", mime: "video/mp4", ...extra });
const post = (caption: string, media: MediaItem[] = [], options: Record<string, unknown> = {}) => ({ caption, media, options });
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("countCharacters", () => {
  it("counts graphemes, not code units", () => {
    expect(countCharacters("BLUESKY", "👍🏽👨‍👩‍👧")).toBe(2);
    expect(countCharacters("BLUESKY", "héllo")).toBe(5);
  });
  it("counts URLs as 23 on X and Mastodon", () => {
    const url = "https://example.com/a/very/long/path/that/goes/on/and/on";
    expect(countCharacters("X", `hi ${url}`)).toBe(3 + 23);
    expect(countCharacters("MASTODON", url)).toBe(23);
    expect(countCharacters("BLUESKY", url)).toBe(url.length);
  });
  it("weighs CJK and emoji as 2 on X", () => {
    expect(countCharacters("X", "日本")).toBe(4);
    expect(countCharacters("X", "a👍")).toBe(3);
  });
});

describe("validateAgainstLimits", () => {
  it("flags empty posts", () => {
    expect(codes(validateAgainstLimits("X", post("  ")))).toEqual(["empty"]);
    expect(validateAgainstLimits("X", post("", [img()]))).toEqual([]);
  });
  it("warns will_thread between caption and captionHard, errors above", () => {
    const w = validateAgainstLimits("X", post("word ".repeat(100)));
    expect(w).toHaveLength(1);
    expect(w[0]?.level).toBe("warning");
    expect(w[0]?.code).toBe("will_thread");
    expect(w[0]?.message).toMatch(/exceeds 280 characters and will be split into a thread/);
    expect(codes(validateAgainstLimits("X", post("a".repeat(5001))))).toEqual(["caption_too_long"]);
  });
  it("errors when over caption with no captionHard", () => {
    const i = validateAgainstLimits("DISCORD", post("a".repeat(2001)));
    expect(i[0]).toMatchObject({ level: "error", code: "caption_too_long" });
  });
  it("counts hashtags", () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ");
    expect(codes(validateAgainstLimits("INSTAGRAM", post(tags, [img()])))).toContain("too_many_hashtags");
    expect(codes(validateAgainstLimits("INSTAGRAM", post("see https://x.com/#a #ok", [img()])))).toEqual([]);
  });
  it("checks media counts, mixing, sizes and requirements", () => {
    expect(codes(validateAgainstLimits("X", post("hi", [img(), img(), img(), img(), img()])))).toContain("too_many_images");
    expect(codes(validateAgainstLimits("X", post("hi", [vid(), vid()])))).toContain("too_many_videos");
    expect(codes(validateAgainstLimits("X", post("hi", [img(), vid()])))).toContain("mixed_media");
    expect(codes(validateAgainstLimits("TELEGRAM", post("hi", [img(), vid()])))).not.toContain("mixed_media");
    expect(codes(validateAgainstLimits("X", post("hi", [img({ sizeBytes: 6 * 1024 * 1024 })])))).toContain("media_too_large");
    expect(codes(validateAgainstLimits("INSTAGRAM", post("hi")))).toContain("media_required");
    expect(codes(validateAgainstLimits("X", post("hi", [{ url: "u", mime: "application/pdf" }])))).toContain("unsupported_media");
  });
});

describe("validateForNetwork (client)", () => {
  it("doesn't require a Pinterest board (it defaults to the account's first board)", () => {
    expect(codes(validateForNetwork("PINTEREST", post("hi", [img()])))).toEqual([]);
  });
  it("requires a subreddit and a title for Reddit", () => {
    expect(codes(validateForNetwork("REDDIT", post("Big news\nBody text")))).toEqual(["option_invalid"]);
    expect(codes(validateForNetwork("REDDIT", post("Big news\nBody text", [], { subreddit: "r/coffee" })))).toEqual([]);
    expect(codes(validateForNetwork("REDDIT", post("x".repeat(400), [], { subreddit: "coffee" })))).toContain("option_invalid");
  });
  it("warns about long Telegram media captions", () => {
    const i = validateForNetwork("TELEGRAM", post("a".repeat(1500), [img()]));
    expect(i).toEqual([expect.objectContaining({ level: "warning", code: "caption_too_long" })]);
    expect(validateForNetwork("TELEGRAM", post("a".repeat(1500)))).toEqual([]);
  });
  it("caps Bluesky images at 1MB and rejects LinkedIn video", () => {
    expect(codes(validateForNetwork("BLUESKY", post("hi", [img({ sizeBytes: 1_500_000 })])))).toContain("media_too_large");
    expect(codes(validateForNetwork("LINKEDIN", post("hi", [vid()])))).toContain("unsupported_media");
  });
});

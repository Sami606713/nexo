import { describe, expect, it } from "vitest";
import type { PostScoreCheck } from "@postline/core";
import { SCORE_WEIGHTS, bandFor, hashtagRange, scorePostHeuristic } from "../src/score";

const check = (caption: string, id: PostScoreCheck["id"], networks: Parameters<typeof scorePostHeuristic>[0]["networks"] = ["LINKEDIN"], mediaCount = 1) =>
  scorePostHeuristic({ caption, networks, mediaCount }).checks.find((c) => c.id === id)!;

const GREAT = [
  "How we cut onboarding time by 43% in 6 weeks?",
  "",
  "Three changes made the difference:",
  "- Replaced the 12-step setup wizard with a single checklist",
  "- Sent a personalised welcome video from the customer success team",
  "- Scheduled a 15-minute kickoff call within 24 hours",
  "",
  "The result: activation went from 31% to 58%.",
  "",
  "Which of these would you try first? Tell us in the comments.",
].join("\n");

describe("weights & bands", () => {
  it("weights sum to 100 and there are 11 checks", () => {
    expect(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(Object.keys(SCORE_WEIGHTS)).toHaveLength(11);
    const s = scorePostHeuristic({ caption: GREAT, networks: ["LINKEDIN"], mediaCount: 1 });
    expect(s.checks).toHaveLength(11);
    expect(s.checks.reduce((a, c) => a + c.weight, 0)).toBe(100);
  });

  it("bands", () => {
    expect(bandFor(100)).toBe("High");
    expect(bandFor(85)).toBe("High");
    expect(bandFor(84)).toBe("Strong");
    expect(bandFor(70)).toBe("Strong");
    expect(bandFor(69)).toBe("Fair");
    expect(bandFor(50)).toBe("Fair");
    expect(bandFor(49)).toBe("Low");
    expect(bandFor(0)).toBe("Low");
  });

  it("a strong post scores High and every check passes", () => {
    const s = scorePostHeuristic({ caption: GREAT, networks: ["LINKEDIN"], mediaCount: 1 });
    expect(s.band).toBe("High");
    expect(s.total).toBe(100);
    for (const c of s.checks) expect(c.passed, c.id).toBe(true);
  });

  it("empty caption scores Low with suggestions on every failed check", () => {
    const s = scorePostHeuristic({ caption: "", networks: ["X"], mediaCount: 0 });
    expect(s.band).toBe("Low");
    expect(s.total).toBeLessThan(20);
    for (const c of s.checks.filter((x) => !x.passed)) expect(c.suggestion, c.id).toBeTruthy();
  });

  it("is deterministic", () => {
    const a = scorePostHeuristic({ caption: GREAT, networks: ["X", "LINKEDIN"], mediaCount: 0 });
    const b = scorePostHeuristic({ caption: GREAT, networks: ["X", "LINKEDIN"], mediaCount: 0 });
    expect(a).toEqual(b);
  });

  it("passed means earned >= 70% of weight; total is the sum of earned", () => {
    for (const cap of [GREAT, "hi", "BUY NOW!!!! 🔥🔥🔥🔥🔥🔥🔥🔥 https://a.com https://b.com", "Just a plain sentence about our product today."]) {
      const s = scorePostHeuristic({ caption: cap, networks: ["INSTAGRAM"], mediaCount: 0 });
      expect(s.total).toBe(s.checks.reduce((a, c) => a + c.earned, 0));
      for (const c of s.checks) {
        expect(c.passed).toBe(c.earned >= c.weight * 0.7);
        expect(c.earned).toBeGreaterThanOrEqual(0);
        expect(c.earned).toBeLessThanOrEqual(c.weight);
        if (!c.passed) expect(c.suggestion).toBeTruthy();
      }
    }
  });

  it("media and length_fit are not fixable; others are", () => {
    const s = scorePostHeuristic({ caption: GREAT, networks: ["X"], mediaCount: 0 });
    for (const c of s.checks) expect(c.fixable).toBe(c.id !== "media" && c.id !== "length_fit");
  });
});

describe("individual checks", () => {
  it("substance", () => {
    expect(check("ok", "substance").passed).toBe(false);
    expect(check("🔥🔥🔥 #wow", "substance").earned).toBe(0);
    expect(check("We just shipped dark mode for every workspace.", "substance").passed).toBe(true);
  });

  it("hook: short first line with question/number/benefit", () => {
    expect(check("Why do most launches fail?\nMore text here.", "hook").passed).toBe(true);
    expect(check("5 lessons from our first year\nMore.", "hook").passed).toBe(true);
    expect(check("Hello there friends and welcome\nMore.", "hook").passed).toBe(false);
    const long = "Why ".concat("a".repeat(200), "?");
    const c = check(long, "hook");
    expect(c.passed).toBe(false);
    expect(c.suggestion).toMatch(/120/);
  });

  it("length_fit: full / threads partial / over hard limit", () => {
    expect(check("Short post.", "length_fit", ["X"]).earned).toBe(10);
    const c300 = "word ".repeat(80); // 400 chars
    const x = check(c300, "length_fit", ["X"]);
    expect(x.earned).toBe(6);
    expect(x.passed).toBe(false);
    expect(x.suggestion).toMatch(/thread/);
    const pin = check("a ".repeat(400), "length_fit", ["PINTEREST"]);
    expect(pin.earned).toBe(0);
    expect(pin.suggestion).toMatch(/500/);
    expect(check("a ".repeat(400), "length_fit", ["LINKEDIN"]).earned).toBe(10);
  });

  it("takeaway: specificity", () => {
    expect(check("Nice day today.", "takeaway").passed).toBe(false);
    expect(check(GREAT, "takeaway").passed).toBe(true);
    expect(check("How to write better onboarding emails: 3 tips from Stripe and Notion customers.", "takeaway").passed).toBe(true);
  });

  it("scannable: long captions need line breaks", () => {
    const wall = "This is a long sentence about something interesting. ".repeat(8);
    expect(check(wall, "scannable").passed).toBe(false);
    const broken = "This is a long sentence about something interesting.\n\n".repeat(8);
    expect(check(broken, "scannable").passed).toBe(true);
    expect(check("short", "scannable").passed).toBe(true);
  });

  it("cta: question or CTA verbs", () => {
    expect(check("We launched today.", "cta").passed).toBe(false);
    expect(check("We launched today. What do you think?", "cta").passed).toBe(true);
    expect(check("We launched today. Sign up at the link in bio.", "cta").passed).toBe(true);
  });

  it("media", () => {
    expect(check("x", "media", ["INSTAGRAM"], 0).earned).toBe(0);
    expect(check("x", "media", ["INSTAGRAM"], 0).suggestion).toMatch(/INSTAGRAM/);
    expect(check("x", "media", ["INSTAGRAM"], 2).earned).toBe(10);
  });

  it("hashtags: per-network ranges", () => {
    expect(hashtagRange(["INSTAGRAM"])).toEqual([3, 15]);
    expect(hashtagRange(["X"])).toEqual([0, 3]);
    expect(hashtagRange(["LINKEDIN"])).toEqual([0, 5]);
    expect(hashtagRange(["FACEBOOK"])).toEqual([0, 10]);
    expect(hashtagRange(["INSTAGRAM", "X"])).toEqual([3, 3]);
    expect(hashtagRange([])).toEqual([0, 10]);
    expect(check("Post #a #b", "hashtags", ["X"]).passed).toBe(true);
    expect(check("Post #a #b #c #d #e #f #g", "hashtags", ["X"]).passed).toBe(false);
    expect(check("Post with no tags", "hashtags", ["INSTAGRAM"]).passed).toBe(false);
    expect(check("Post #a #b #c #d", "hashtags", ["INSTAGRAM"]).passed).toBe(true);
    // a URL fragment / colour code is not a hashtag when glued to a word
    expect(check("See page#section", "hashtags", ["X"]).passed).toBe(true);
  });

  it("links: at most one, not in first line", () => {
    expect(check("Hook line\nRead more https://a.com", "links").passed).toBe(true);
    expect(check("https://a.com is great\nmore", "links").passed).toBe(false);
    expect(check("Hook\nhttps://a.com and https://b.com", "links").passed).toBe(false);
    expect(check("No links here", "links").passed).toBe(true);
  });

  it("readability: average sentence length", () => {
    expect(check("Short one. Another short one. Easy to read.", "readability").passed).toBe(true);
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ") + ".";
    expect(check(long, "readability").passed).toBe(false);
  });

  it("spam: emoji, exclamation marks, caps", () => {
    expect(check("A calm post about our product launch today.", "spam").passed).toBe(true);
    expect(check("Wow 🔥🔥🔥🔥🔥🔥🔥 great", "spam").passed).toBe(false);
    expect(check("Wow! Great! Amazing! Incredible!", "spam").passed).toBe(false);
    expect(check("THIS IS THE BEST PRODUCT EVER MADE BY ANYONE", "spam").passed).toBe(false);
  });
});

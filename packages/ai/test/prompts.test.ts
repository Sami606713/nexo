import { describe, expect, it } from "vitest";
import {
  buildCampaignCaptionsPrompt,
  buildCampaignOutlinePrompt,
  buildFixPrompt,
  buildGeneratePostPrompt,
  buildRewritePrompt,
  buildSystemPrompt,
  chunk,
  cleanReplacement,
  dedupeAngles,
  distributeSchedule,
  networksNeedingVariant,
  normalizeHashtags,
  restrictToLibrary,
  truncateToLimit,
} from "../src/prompts";
import type { CampaignRequest } from "@postline/core";

const brand = {
  name: "Acme Coffee",
  website: "https://acme.coffee",
  description: "Specialty coffee roaster in Berlin.",
  voice: "Warm, nerdy about beans, no corporate speak.",
  audience: "Home baristas",
  avoid: "cheap, discount",
};

describe("system prompt", () => {
  it("includes brand fields and the no-invention rule", () => {
    const s = buildSystemPrompt(brand);
    expect(s).toContain("Acme Coffee");
    expect(s).toContain("Specialty coffee roaster in Berlin.");
    expect(s).toContain("Warm, nerdy");
    expect(s).toContain("Home baristas");
    expect(s).toContain("cheap, discount");
    expect(s).toMatch(/Never invent facts, statistics, prices/);
  });
  it("is deterministic (cacheable) and omits empty fields", () => {
    expect(buildSystemPrompt(brand)).toBe(buildSystemPrompt({ ...brand }));
    const s = buildSystemPrompt({ name: "X" });
    expect(s).not.toContain("Voice and style:");
    expect(s).not.toContain("Avoid (");
  });
});

describe("generate prompt", () => {
  it("respects tone/length/language/networks", () => {
    const p = buildGeneratePostPrompt({ prompt: "New roast", networks: ["X", "LINKEDIN"], tone: "witty", length: "short", language: "German" });
    expect(p).toContain("witty");
    expect(p).toContain("short:");
    expect(p).toContain("German");
    expect(p).toContain("X ≤ 280");
    expect(p).toContain("perNetwork");
  });
  it("restricts hashtags to the library", () => {
    const p = buildGeneratePostPrompt({ prompt: "x", networks: ["INSTAGRAM"], hashtagLibrary: ["#Coffee", "beans", "coffee"] });
    expect(p).toMatch(/ONLY from this list/);
    expect(p).toContain("#Coffee #beans");
  });
  it("no hashtags when disabled", () => {
    expect(buildGeneratePostPrompt({ prompt: "x", networks: ["X"], includeHashtags: false })).toMatch(/empty `hashtags`/);
  });
});

describe("rewrite prompt", () => {
  it("asks for replacement only and includes context", () => {
    const p = buildRewritePrompt({ text: "teh beans", context: "We love teh beans today", action: "fix_grammar" });
    expect(p).toMatch(/Return ONLY the replacement text/);
    expect(p).toContain("<full_caption>");
    expect(p).toContain("teh beans");
  });
  it("translate includes target language", () => {
    expect(buildRewritePrompt({ text: "hi", action: "translate", targetLanguage: "French" })).toContain("French");
  });
  it("cleanReplacement strips wrappers", () => {
    expect(cleanReplacement('"Hello"')).toBe("Hello");
    expect(cleanReplacement("```\nHello\n```")).toBe("Hello");
    expect(cleanReplacement("<text>Hi</text>")).toBe("Hi");
    expect(cleanReplacement("Plain")).toBe("Plain");
  });
});

describe("hashtags", () => {
  it("normalizes and dedupes case-insensitively", () => {
    expect(normalizeHashtags(["#Coffee", "coffee", " #COFFEE ", "latte art", "##beans", ""])).toEqual(["Coffee", "latteart", "beans"]);
    expect(normalizeHashtags(["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });
  it("restricts to library using library spelling", () => {
    expect(restrictToLibrary(["coffee", "random", "#BEANS"], ["#Coffee", "Beans"])).toEqual(["Coffee", "Beans"]);
  });
});

describe("per-network variants", () => {
  it("flags networks whose limit is exceeded (incl. hashtags)", () => {
    const cap = "a".repeat(270);
    expect(networksNeedingVariant(cap, [], ["X", "LINKEDIN"])).toEqual([]);
    expect(networksNeedingVariant(cap, ["coffee", "beans"], ["X", "LINKEDIN"])).toEqual(["X"]);
    expect(networksNeedingVariant("a".repeat(600), [], ["X", "THREADS", "LINKEDIN"])).toEqual(["X", "THREADS"]);
  });
  it("truncateToLimit", () => {
    const t = truncateToLimit("hello world this is long", 12);
    expect([...t].length).toBeLessThanOrEqual(12);
    expect(t.endsWith("…")).toBe(true);
    expect(truncateToLimit("short", 10)).toBe("short");
  });
});

describe("campaign schedule", () => {
  const valid = (t: string) => /^\d{2}:\d{2}$/.test(t) && t >= "09:00" && t <= "18:00";

  it("one post per day spread across the duration with varied times", () => {
    const s = distributeSchedule(7, 14);
    expect(s).toHaveLength(7);
    expect(s.map((x) => x.dayOffset)).toEqual([0, 2, 4, 6, 8, 10, 12]);
    expect(new Set(s.map((x) => x.time)).size).toBeGreaterThan(3);
    for (const x of s) expect(valid(x.time)).toBe(true);
  });

  it("several posts per day get distinct, evenly spaced times", () => {
    const s = distributeSchedule(9, 3);
    expect(s).toHaveLength(9);
    for (let d = 0; d < 3; d++) {
      const times = s.filter((x) => x.dayOffset === d).map((x) => x.time);
      expect(times).toEqual(["09:00", "13:30", "18:00"]);
    }
  });

  it("stays within range and sorted for many shapes", () => {
    for (const [count, days] of [[1, 1], [1, 30], [5, 1], [10, 7], [30, 30], [45, 7], [100, 3], [3, 90]] as const) {
      const s = distributeSchedule(count, days);
      expect(s).toHaveLength(count);
      for (const x of s) {
        expect(x.dayOffset).toBeGreaterThanOrEqual(0);
        expect(x.dayOffset).toBeLessThan(days);
        expect(valid(x.time)).toBe(true);
      }
      const keys = s.map((x) => `${x.dayOffset}-${x.time}`);
      expect(new Set(keys).size).toBe(count); // no two posts at the same slot
      for (let i = 1; i < s.length; i++) expect(s[i]!.dayOffset).toBeGreaterThanOrEqual(s[i - 1]!.dayOffset);
    }
  });

  it("first post is day 0 and posts reach the end of the window", () => {
    const s = distributeSchedule(4, 28);
    expect(s[0]!.dayOffset).toBe(0);
    expect(s[3]!.dayOffset).toBe(21);
  });

  const req: CampaignRequest = {
    prompt: "Launch our new Ethiopian roast",
    goal: "launch",
    audience: "home baristas",
    startDate: "2026-11-01",
    durationDays: 7,
    count: 3,
    networks: ["X", "INSTAGRAM"],
  };

  it("outline prompt lists slots and asks for exactly count unique angles", () => {
    const p = buildCampaignOutlinePrompt(req, distributeSchedule(3, 7));
    expect(p).toContain("exactly 3");
    expect(p).toContain("day 0 at");
    expect(p).toMatch(/No two angles may repeat/);
    expect(p).toContain("home baristas");
  });

  it("captions prompt includes each index and the tightest limit", () => {
    const p = buildCampaignCaptionsPrompt(req, [
      { index: 0, angle: "Teaser", dayOffset: 0, time: "09:30" },
      { index: 1, angle: "Launch", dayOffset: 2, time: "12:00" },
    ]);
    expect(p).toContain("index 0");
    expect(p).toContain("index 1");
    expect(p).toContain("at most 280 characters");
  });

  it("dedupeAngles / chunk", () => {
    expect(dedupeAngles(["Teaser!", "teaser", "  Launch day ", "launch-day"])).toEqual(["Teaser!", "Launch day"]);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("fix prompt", () => {
  it("scopes the edit to one check and keeps the rest verbatim", () => {
    const p = buildFixPrompt("my caption", "cta", ["X"]);
    expect(p).toMatch(/Fix exactly one issue/);
    expect(p).toMatch(/Leave every other part of the caption exactly as it is/);
    expect(p).toContain("call to action");
    expect(buildFixPrompt("c", "hashtags", ["INSTAGRAM"])).toContain("3–15");
  });
});

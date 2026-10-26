import { describe, expect, it } from "vitest";
import { offlineCampaign, offlinePost, topicFromPrompt } from "../src/offline";

const brand = { name: "Brightleaf Studio" };
const req = {
  prompt: "Launch of our new eco-friendly reusable water bottle line",
  goal: "launch" as const,
  audience: "buyers/customers",
  startDate: "2026-11-01",
  durationDays: 10,
  count: 8,
  networks: ["LINKEDIN" as const],
  tone: "friendly" as const,
  length: "medium" as const,
  includeHashtags: true,
};

describe("offline template copywriter", () => {
  it("plans exactly `count` distinct, deterministic posts within the date range", () => {
    const plan = offlineCampaign(brand, req);
    expect(plan).toHaveLength(8);
    expect(new Set(plan.map((p) => p.angle)).size).toBe(8);
    expect(new Set(plan.map((p) => p.caption)).size).toBe(8);
    for (const p of plan) {
      expect(p.dayOffset).toBeGreaterThanOrEqual(0);
      expect(p.dayOffset).toBeLessThan(10);
      expect(p.time).toMatch(/^\d\d:\d\d$/);
      expect(p.caption.length).toBeGreaterThan(40);
      expect(p.hashtags.every((h) => h.startsWith("#"))).toBe(true);
    }
    expect(offlineCampaign(brand, req)).toEqual(plan);
  });

  it("respects hashtags off, professional tone (no emoji) and X length", () => {
    const plan = offlineCampaign(brand, { ...req, includeHashtags: false, tone: "professional", length: "long" });
    expect(plan.every((p) => p.hashtags.length === 0)).toBe(true);
    expect(plan.some((p) => /\p{Extended_Pictographic}/u.test(p.caption))).toBe(false);
    const post = offlinePost(brand, { prompt: "Angle: Pro tip\nTime management for agencies", networks: ["X"], length: "long" });
    expect(post.caption).toContain("Pro tip");
    expect(post.perNetwork?.X?.length ?? 0).toBeLessThanOrEqual(280);
  });

  it("extracts a clean topic", () => {
    expect(topicFromPrompt("Create a campaign about our autumn menu. More details")).toBe("our autumn menu");
    expect(topicFromPrompt("Launch of our new app")).toBe("our new app");
  });
});

import { describe, expect, it } from "vitest";
import { countCharacters, splitIntoThread } from "@postline/core";

describe("splitIntoThread", () => {
  it("returns the caption unchanged when it fits", () => {
    expect(splitIntoThread("X", "hello")).toEqual(["hello"]);
  });

  it("never exceeds the limit and numbers parts", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const parts = splitIntoThread("X", text);
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((p, i) => {
      expect(countCharacters("X", p)).toBeLessThanOrEqual(280);
      expect(p.endsWith(` ${i + 1}/${parts.length}`)).toBe(true);
    });
  });

  it("prefers paragraph boundaries", () => {
    const a = "A".repeat(10) + " " + "a ".repeat(100).trim();
    const b = "B".repeat(10) + " " + "b ".repeat(100).trim();
    const parts = splitIntoThread("X", `${a}\n\n${b}`, { numbering: false });
    expect(parts).toEqual([a, b]);
  });

  it("splits at sentence boundaries before words", () => {
    const s1 = "First sentence " + "x".repeat(150) + ".";
    const s2 = "Second sentence " + "y".repeat(150) + ".";
    const parts = splitIntoThread("X", `${s1} ${s2}`, { numbering: false });
    expect(parts).toEqual([s1, s2]);
  });

  it("splits at words and hard-cuts very long words", () => {
    const parts = splitIntoThread("BLUESKY", "z".repeat(700), { numbering: false });
    expect(parts.map((p) => p.length)).toEqual([300, 300, 100]);
    const words = splitIntoThread("BLUESKY", "word ".repeat(200).trim(), { numbering: false });
    words.forEach((p) => {
      expect(p.length).toBeLessThanOrEqual(300);
      expect(p.startsWith("word")).toBe(true);
      expect(p.endsWith("word")).toBe(true);
    });
    expect(words.join(" ")).toBe("word ".repeat(200).trim());
  });

  it("keeps numbering within the limit for many parts", () => {
    const parts = splitIntoThread("X", "lorem ipsum ".repeat(400));
    expect(parts.length).toBeGreaterThanOrEqual(10);
    parts.forEach((p) => expect(countCharacters("X", p)).toBeLessThanOrEqual(280));
  });
});

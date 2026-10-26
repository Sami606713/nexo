import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAiService } from "../src/service";
import type { LlmClient } from "../src/llm";

type Handler = (body: Record<string, unknown>) => unknown;

function toolResponse(name: string, input: unknown) {
  return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name, input }] };
}
function textResponse(text: string) {
  return { stop_reason: "end_turn", content: [{ type: "text", text }] };
}

function mockClient(handler: Handler) {
  const calls: Record<string, unknown>[] = [];
  const create = async (body: Record<string, unknown>) => {
    calls.push(body);
    return handler(body);
  };
  const client: LlmClient = { messages: { create }, beta: { messages: { create } } };
  return { client, calls };
}

const userText = (body: Record<string, unknown>) =>
  ((body.messages as Array<{ content: string }>)[0]?.content ?? "") as string;
const toolName = (body: Record<string, unknown>) => (body.tools as Array<{ name: string }> | undefined)?.[0]?.name;

const brand = { name: "Acme Coffee", description: "Coffee roaster", voice: "Warm" };

let savedKey: string | undefined;
beforeEach(() => {
  savedKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});
afterEach(() => {
  if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
});

describe("configuration", () => {
  it("throws a clear error without a key, but heuristic scoring still works", async () => {
    const svc = createAiService();
    await expect(svc.generatePost(brand, { prompt: "x", networks: ["X"] })).rejects.toThrow(
      "AI is not configured",
    );
    await expect(svc.fetchBrand("https://example.com")).rejects.toThrow(/not configured/);
    const s = await svc.scorePost({ caption: "Why does this work? Try it.", networks: ["X"], mediaCount: 1 }, { useLlm: true });
    expect(s.checks).toHaveLength(11);
  });

  it("importing the package entry does not throw without a key", async () => {
    const mod = await import("../src/service");
    expect(typeof mod.createAiService).toBe("function");
  });
});

describe("generatePost", () => {
  it("uses a cached brand system block, strict tool, and returns a short X variant", async () => {
    const long = "A".repeat(150) + " " + "b".repeat(200);
    const { client, calls } = mockClient((body) => {
      if (toolName(body) === "submit_post") {
        return toolResponse("submit_post", {
          caption: long,
          hashtags: ["#Coffee", "coffee", "beans"],
          perNetwork: [{ network: "X", caption: "Short X version of the post." }],
        });
      }
      throw new Error("unexpected call");
    });
    const svc = createAiService(client);
    const out = await svc.generatePost(brand, { prompt: "new roast", networks: ["X", "LINKEDIN"], tone: "friendly" });
    expect(out.caption).toBe(long);
    expect(out.hashtags).toEqual(["Coffee", "beans"]);
    expect(out.perNetwork).toEqual({ X: "Short X version of the post." });

    const body = calls[0]!;
    const system = body.system as Array<{ text: string; cache_control?: unknown }>;
    expect(system[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(system[0]!.text).toContain("Acme Coffee");
    expect((body.tools as Array<{ strict?: boolean }>)[0]!.strict).toBe(true);
    expect(body.tool_choice).toEqual({ type: "auto" });
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body).not.toHaveProperty("temperature");
  });

  it("generates a variant when the model omits one or it is still too long", async () => {
    const { client, calls } = mockClient((body) => {
      if (toolName(body) === "submit_post") return toolResponse("submit_post", { caption: "x ".repeat(200), hashtags: [], perNetwork: [] });
      return textResponse("Tight X copy.");
    });
    const out = await createAiService(client).generatePost(brand, { prompt: "p", networks: ["X"], includeHashtags: false });
    expect(out.perNetwork?.X).toBe("Tight X copy.");
    expect(out.hashtags).toEqual([]);
    expect(calls[1]!.model).toBe("claude-haiku-5-5");
  });

  it("omits perNetwork when everything fits and filters to the hashtag library", async () => {
    const { client } = mockClient(() =>
      toolResponse("submit_post", { caption: "Fresh beans are in.", hashtags: ["coffee", "invented", "BEANS"], perNetwork: [] }),
    );
    const out = await createAiService(client).generatePost(brand, {
      prompt: "p",
      networks: ["INSTAGRAM"],
      hashtagLibrary: ["Coffee", "Beans", "Latte"],
    });
    expect(out.perNetwork).toBeUndefined();
    expect(out.hashtags).toEqual(["Coffee", "Beans"]);
  });

  it("retries once on invalid tool output, then fails clearly", async () => {
    let n = 0;
    const { client } = mockClient(() => {
      n++;
      return toolResponse("submit_post", { nope: true });
    });
    await expect(createAiService(client).generatePost(brand, { prompt: "p", networks: ["X"] })).rejects.toThrow(/invalid response/);
    expect(n).toBe(2);
  });

  it("surfaces refusals", async () => {
    const { client } = mockClient(() => ({ stop_reason: "refusal", content: [] }));
    await expect(createAiService(client).generatePost(brand, { prompt: "p", networks: ["X"] })).rejects.toThrow(/declined/);
  });
});

describe("rewrite / hashtags", () => {
  it("rewrite returns only the replacement, uses the fast model, keeps surrounding whitespace", async () => {
    const { client, calls } = mockClient(() => textResponse('"the beans"'));
    const out = await createAiService(client).rewrite(brand, { text: " teh beans ", action: "fix_grammar", context: "We love teh beans" });
    expect(out).toBe(" the beans ");
    expect(calls[0]!.model).toBe("claude-haiku-5-5");
    expect(userText(calls[0]!)).toContain("<full_caption>");
  });

  it("generateHashtags dedupes and caps to count", async () => {
    const { client } = mockClient(() => toolResponse("submit_hashtags", { hashtags: ["#Coffee", "coffee", "Beans", "latte", "roast"] }));
    expect(await createAiService(client).generateHashtags(brand, "caption", ["INSTAGRAM"], 3)).toEqual(["Coffee", "Beans", "latte"]);
  });
});

describe("planCampaign", () => {
  const req = {
    prompt: "Launch the Ethiopian roast",
    goal: "launch" as const,
    startDate: "2026-11-01",
    durationDays: 14,
    networks: ["LINKEDIN" as const],
  };

  function campaignClient() {
    let maxInFlight = 0;
    let inFlight = 0;
    const captionCalls: number[][] = [];
    const { client, calls } = mockClient(async (body) => {
      const u = userText(body);
      if (toolName(body) === "submit_outline") {
        const count = Number(u.match(/exactly (\d+)/)![1]);
        return toolResponse("submit_outline", { angles: Array.from({ length: count }, (_, i) => `Angle number ${i + 1}`) });
      }
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      const idx = [...u.matchAll(/- index (\d+)/g)].map((m) => Number(m[1]));
      captionCalls.push(idx);
      return toolResponse("submit_captions", {
        posts: idx.map((i) => ({ index: i, caption: `Caption ${i}`, hashtags: ["#Launch", "launch"] })),
      });
    });
    return { client, calls, captionCalls, maxInFlight: () => maxInFlight };
  }

  it("≤10 posts: one outline call + one caption batch, exactly count items", async () => {
    const m = campaignClient();
    const items = await createAiService(m.client).planCampaign(brand, { ...req, count: 7 });
    expect(items).toHaveLength(7);
    expect(m.captionCalls).toHaveLength(1);
    expect(items.map((i) => i.dayOffset)).toEqual([0, 2, 4, 6, 8, 10, 12]);
    expect(items[3]!.caption).toBe("Caption 3");
    expect(items[0]!.hashtags).toEqual(["Launch"]);
    expect(new Set(items.map((i) => i.angle)).size).toBe(7);
  });

  it(">10 posts: chunks of 10 in parallel with concurrency ≤ 4", async () => {
    const m = campaignClient();
    const items = await createAiService(m.client).planCampaign(brand, { ...req, count: 55, durationDays: 30 });
    expect(items).toHaveLength(55);
    expect(m.captionCalls).toHaveLength(6);
    expect(m.maxInFlight()).toBeLessThanOrEqual(4);
    expect(m.maxInFlight()).toBeGreaterThan(1);
    expect(items.map((i) => i.caption)).toEqual(Array.from({ length: 55 }, (_, i) => `Caption ${i}`));
  });

  it("tops up duplicate/missing angles with a second outline call", async () => {
    let outlineCalls = 0;
    const { client } = mockClient((body) => {
      if (toolName(body) === "submit_outline") {
        outlineCalls++;
        return toolResponse("submit_outline", { angles: outlineCalls === 1 ? ["Teaser", "teaser", "Launch"] : ["Behind the scenes"] });
      }
      const idx = [...userText(body).matchAll(/- index (\d+)/g)].map((m) => Number(m[1]));
      return toolResponse("submit_captions", { posts: idx.map((i) => ({ index: i, caption: `C${i}`, hashtags: [] })) });
    });
    const items = await createAiService(client).planCampaign(brand, { ...req, count: 3 });
    expect(outlineCalls).toBe(2);
    expect(items.map((i) => i.angle)).toEqual(["Teaser", "Launch", "Behind the scenes"]);
  });
});

describe("scorePost", () => {
  const input = { caption: "Hello there friends\nWe made a thing.", networks: ["LINKEDIN" as const], mediaCount: 1 };

  it("refines only hook and takeaway with the LLM", async () => {
    const { client, calls } = mockClient(() =>
      toolResponse("submit_ratings", { hook: { score: 1, suggestion: "" }, takeaway: { score: 0.25, suggestion: "Add a concrete example." } }),
    );
    const svc = createAiService(client);
    const base = await svc.scorePost(input);
    const refined = await svc.scorePost(input, { useLlm: true });
    expect(calls).toHaveLength(1);
    const get = (s: typeof base, id: string) => s.checks.find((c) => c.id === id)!;
    expect(get(refined, "hook").earned).toBe(12);
    expect(get(refined, "hook").passed).toBe(true);
    expect(get(refined, "takeaway").earned).toBe(3);
    expect(get(refined, "takeaway").suggestion).toBe("Add a concrete example.");
    for (const c of base.checks.filter((x) => x.id !== "hook" && x.id !== "takeaway")) {
      expect(get(refined, c.id)).toEqual(c);
    }
    expect(refined.total).toBe(refined.checks.reduce((a, c) => a + c.earned, 0));
  });

  it("falls back to heuristics on LLM failure", async () => {
    const { client } = mockClient(() => {
      throw new Error("boom");
    });
    const svc = createAiService(client);
    expect(await svc.scorePost(input, { useLlm: true })).toEqual(await svc.scorePost(input));
  });
});

describe("fixScoreCheck", () => {
  it("returns the fixed caption and refuses non-fixable checks", async () => {
    const { client, calls } = mockClient(() => toolResponse("submit_caption", { caption: "We made a thing. What do you think?" }));
    const svc = createAiService(client);
    expect(await svc.fixScoreCheck(brand, "We made a thing.", "cta", ["X"])).toBe("We made a thing. What do you think?");
    expect(userText(calls[0]!)).toMatch(/Fix exactly one issue/);
    await expect(svc.fixScoreCheck(brand, "x", "media", ["X"])).rejects.toThrow(/can't be fixed/);
    await expect(svc.fixScoreCheck(brand, "x", "length_fit", ["X"])).rejects.toThrow(/can't be fixed/);
  });
});

describe("fetchBrand", () => {
  it("fetches, extracts and summarises", async () => {
    const html = `<html><head><title>Acme</title><meta name="description" content="Coffee."><meta name="theme-color" content="#c0392b"></head>
      <body><img src="/logo.png" alt="logo"><p>We roast coffee for home baristas.</p></body></html>`;
    const fetchImpl = (async () => new Response(html, { headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    const { client, calls } = mockClient(() =>
      toolResponse("submit_brand", { name: "Acme Coffee", description: "Roaster.", voice: "Warm", audience: "Home baristas" }),
    );
    const svc = createAiService(client, { fetchImpl, resolve: async () => ["93.184.216.34"] });
    const res = await svc.fetchBrand("acme.coffee");
    expect(res).toEqual({
      name: "Acme Coffee",
      description: "Roaster.",
      voice: "Warm",
      audience: "Home baristas",
      colors: ["#c0392b"],
      logoUrls: ["https://acme.coffee/logo.png"],
    });
    expect(userText(calls[0]!)).toContain("We roast coffee for home baristas.");
  });

  it("blocks private targets before fetching", async () => {
    let fetched = false;
    const fetchImpl = (async () => {
      fetched = true;
      return new Response("");
    }) as unknown as typeof fetch;
    const { client } = mockClient(() => textResponse(""));
    const svc = createAiService(client, { fetchImpl, resolve: async () => ["10.0.0.1"] });
    await expect(svc.fetchBrand("https://intranet.example")).rejects.toThrow(/not allowed/);
    expect(fetched).toBe(false);
  });
});

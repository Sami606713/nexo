import { afterEach, describe, expect, it, vi } from "vitest";
import { availableNetworks, getAdapter } from "../src/index";
import { decodeTelegramId, encodeTelegramId, telegramMessageUrl } from "../src/adapters/telegram";
import { parseDiscordWebhook } from "../src/adapters/discord";
import { buildSlackPayload } from "../src/adapters/slack";
import { toLittleText } from "../src/adapters/linkedin";
import { buildFacets } from "../src/adapters/bluesky";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("registry", () => {
  it("hides OAuth networks without client ids", () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "");
    vi.stubEnv("X_CLIENT_ID", "");
    vi.stubEnv("META_APP_ID", "");
    const nets = availableNetworks();
    expect(nets).toEqual(expect.arrayContaining(["BLUESKY", "MASTODON", "TELEGRAM", "DISCORD", "SLACK", "CUSTOM_WEBHOOK"]));
    expect(nets).not.toContain("X");
    expect(nets).not.toContain("FACEBOOK");
    vi.stubEnv("X_CLIENT_ID", "id");
    expect(availableNetworks()).toContain("X");
    expect(getAdapter("PINTEREST")).toBeUndefined();
    expect(getAdapter("X")?.connectKind).toBe("oauth2");
  });
  it("Meta stubs validate but refuse to publish", async () => {
    const ig = getAdapter("INSTAGRAM")!;
    expect(ig.validate({ caption: "hi", media: [], options: {} }).map((i) => i.code)).toContain("media_required");
    await expect(ig.publish({ postId: "p", caption: "hi", media: [], options: {}, channelExtras: {} }, {})).rejects.toMatchObject({ kind: "rejected" });
  });
});

describe("telegram ids", () => {
  it("round-trips chat and message ids", () => {
    const id = encodeTelegramId("-1001234", [5, 6]);
    expect(id).toBe("-1001234:5,6");
    expect(decodeTelegramId(id)).toEqual({ chatId: "-1001234", messageIds: [5, 6] });
    expect(telegramMessageUrl("-1001234", undefined, 5)).toBe("https://t.me/c/1234/5");
    expect(telegramMessageUrl("-1001234", "chan", 5)).toBe("https://t.me/chan/5");
  });
});

describe("discord / slack / linkedin helpers", () => {
  it("parses only real Discord webhook URLs", () => {
    expect(parseDiscordWebhook("https://discordapp.com/api/webhooks/123/abc-DEF").url).toBe("https://discord.com/api/webhooks/123/abc-DEF");
    expect(() => parseDiscordWebhook("https://evil.test/api/webhooks/1/a")).toThrow();
  });
  it("Slack payload escapes text and links non-public media", () => {
    const p = buildSlackPayload({
      caption: "a < b & c",
      media: [
        { url: "https://cdn.test/a.png", mime: "image/png" },
        { url: "http://localhost:3000/uploads/b.png", mime: "image/png" },
      ],
    }) as { text: string; blocks: Array<{ type: string }> };
    expect(p.text).toBe("a &lt; b &amp; c");
    expect(p.blocks.map((b) => b.type)).toEqual(["section", "image", "context"]);
  });
  it("LinkedIn little text escapes reserved chars and keeps hashtags", () => {
    expect(toLittleText("Hi (all) #launch_day see a*b")).toBe("Hi \\(all\\) {hashtag|\\#|launch\\_day} see a\\*b");
  });
});

describe("bluesky facets", () => {
  it("detects links, tags and resolved mentions; drops unresolved", async () => {
    const facets = await buildFacets("hi @alice.test and @ghost.test see https://example.com #tag", async (h) =>
      h === "alice.test" ? "did:plc:alice" : undefined,
    );
    const types = facets.flatMap((f) => f.features.map((x) => x.$type));
    expect(types).toEqual(["app.bsky.richtext.facet#mention", "app.bsky.richtext.facet#link", "app.bsky.richtext.facet#tag"]);
    expect(facets[0]?.features[0]).toMatchObject({ did: "did:plc:alice" });
  });
});

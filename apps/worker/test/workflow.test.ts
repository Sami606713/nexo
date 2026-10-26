import { describe, expect, it } from "vitest";
import { evaluateFilter, renderTemplate, stripHtml, templateVariables } from "../src/lib/template";
import { dedupeItems, feedItemPayload, isPrivateIp, parseFeed } from "../src/lib/rss";
import { offlineCaption } from "../src/lib/agentLlm";
import { toProductPayload, wooProductsUrl } from "../src/lib/woo";
import { delayMs, nextFreeSlot, scheduleDecision, schedulePayload } from "../src/workers/workflowLogic";
import { rssIntervalMs } from "../src/workers/workflowTriggers";

const ctx = {
  trigger: { title: "Hello", nested: { a: [{ b: "deep" }] }, n: 3, obj: { x: 1 } },
  steps: { s1: { text: "Generated text" } },
  brand: { name: "Acme" },
};

describe("template rendering", () => {
  it("replaces trigger, step and brand variables", () => {
    expect(renderTemplate("{{trigger.title}} — {{ steps.s1.text }} by {{brand.name}}", ctx)).toBe("Hello — Generated text by Acme");
  });
  it("resolves nested paths and array indices", () => {
    expect(renderTemplate("{{trigger.nested.a.0.b}}/{{trigger.nested.a[0].b}}", ctx)).toBe("deep/deep");
  });
  it("renders unknown variables as empty and stringifies non-strings", () => {
    expect(renderTemplate("[{{trigger.missing}}][{{steps.nope.text}}][{{trigger.n}}][{{trigger.obj}}]", ctx)).toBe('[][][3][{"x":1}]');
  });
  it("does not walk the prototype chain", () => {
    expect(renderTemplate("{{trigger.constructor}}{{trigger.__proto__}}", ctx)).toBe("");
  });
  it("lists variables", () => {
    expect(templateVariables("a {{trigger.title}} b {{steps.x.text}}")).toEqual(["trigger.title", "steps.x.text"]);
  });
  it("strips html and decodes entities", () => {
    expect(stripHtml("<p>Fish &amp; chips</p><script>x()</script><b>now</b> it&#8217;s")).toBe("Fish & chips\nnow it’s");
  });
});

describe("filter logic", () => {
  it("contains is case-insensitive", () => {
    expect(evaluateFilter("Where's the PRICE list?", "contains", "price")).toBe(true);
    expect(evaluateFilter("hello", "contains", "price")).toBe(false);
  });
  it("does not contain", () => {
    expect(evaluateFilter("Great post", "not_contains", "spam")).toBe(true);
    expect(evaluateFilter("This is SPAM", "not_contains", "spam")).toBe(false);
  });
  it("comma-separated values match any term", () => {
    expect(evaluateFilter("need a quote", "contains", "price, quote")).toBe(true);
    expect(evaluateFilter("need a quote", "not_contains", "price, quote")).toBe(false);
  });
  it("empty value passes", () => {
    expect(evaluateFilter("x", "contains", "")).toBe(true);
  });
});

describe("schedule due-ness", () => {
  const tz = "America/New_York";
  it("interval: first evaluation arms, then fires after the interval", () => {
    const now = new Date("2026-10-26T12:00:00Z");
    expect(scheduleDecision({ mode: "interval", every: 2, unit: "hours" }, null, now, tz)).toBe("arm");
    expect(scheduleDecision({ mode: "interval", every: 2, unit: "hours" }, new Date("2026-10-26T11:00:00Z"), now, tz)).toBe("wait");
    expect(scheduleDecision({ mode: "interval", every: 2, unit: "hours" }, new Date("2026-10-26T10:00:20Z"), now, tz)).toBe("fire");
  });
  it("interval has a 5 minute floor", () => {
    const now = new Date("2026-10-26T12:00:00Z");
    expect(scheduleDecision({ mode: "interval", every: 1, unit: "minutes" }, new Date("2026-10-26T11:58:00Z"), now, tz)).toBe("wait");
  });
  it("daily: fires once at/after HH:mm brand time", () => {
    // 09:00 EDT = 13:00Z
    const cfg = { mode: "daily" as const, time: "09:00" };
    expect(scheduleDecision(cfg, null, new Date("2026-10-26T12:59:00Z"), tz)).toBe("wait");
    expect(scheduleDecision(cfg, null, new Date("2026-10-26T13:00:00Z"), tz)).toBe("fire");
    expect(scheduleDecision(cfg, new Date("2026-10-26T13:00:00Z"), new Date("2026-10-26T13:01:00Z"), tz)).toBe("wait");
    // fired yesterday → due again today
    expect(scheduleDecision(cfg, new Date("2026-10-25T13:00:00Z"), new Date("2026-10-26T13:00:30Z"), tz)).toBe("fire");
  });
  it("daily: doesn't fire hours late after downtime", () => {
    expect(scheduleDecision({ mode: "daily", time: "09:00" }, null, new Date("2026-10-26T16:00:00Z"), tz)).toBe("wait");
  });
  it("schedule payload uses brand-local date/time", () => {
    expect(schedulePayload(new Date("2026-10-26T13:00:00Z"), tz)).toMatchObject({ date: "2026-10-26", time: "09:00", weekday: "Monday" });
  });
  it("next free slot skips occupied slots and respects lead time", () => {
    const now = new Date("2026-10-26T12:58:00Z"); // 08:58 EDT
    const first = nextFreeSlot(now, tz, [], new Set());
    expect(first.toISOString()).toBe("2026-10-26T17:00:00.000Z"); // 09:00 local is only 2 min away (< 5 min lead) → 13:00 local
  });
  it("next free slot: lead time and occupancy", () => {
    const now = new Date("2026-10-26T12:57:00Z");
    const s = nextFreeSlot(now, tz, [], new Set(), 2 * 60_000);
    expect(s.toISOString()).toBe("2026-10-26T13:00:00.000Z");
    const s2 = nextFreeSlot(now, tz, [], new Set([s.getTime()]), 2 * 60_000);
    expect(s2.toISOString()).toBe("2026-10-26T17:00:00.000Z"); // 13:00 local
    const custom = nextFreeSlot(now, tz, [{ weekday: 3, minute: 600 }], new Set()); // Wednesday 10:00
    expect(custom.toISOString()).toBe("2026-10-28T14:00:00.000Z");
  });
  it("delay and rss intervals are clamped", () => {
    expect(delayMs({ amount: 2, unit: "hours" })).toBe(7_200_000);
    expect(delayMs({ amount: 0, unit: "minutes" })).toBe(60_000);
    expect(rssIntervalMs({ intervalMinutes: 5 })).toBe(60 * 60_000);
    expect(rssIntervalMs({ intervalMinutes: 500 })).toBe(120 * 60_000);
  });
});

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <title>Tech &amp; Things</title>
  <link>https://example.com</link>
  <item>
    <title>Second post</title>
    <link>https://example.com/2</link>
    <guid isPermaLink="false">post-2</guid>
    <description><![CDATA[<p>Some <b>bold</b> news &amp; more.</p><img src="https://example.com/i2.jpg"/>]]></description>
    <pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate>
  </item>
  <item>
    <title>First post</title>
    <link>https://example.com/1</link>
    <description>Plain summary</description>
    <enclosure url="https://example.com/i1.png" type="image/png" length="1"/>
  </item>
</channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Blog</title>
  <link href="https://atom.example.com/" rel="alternate"/>
  <entry>
    <title type="html">Atom &lt;em&gt;entry&lt;/em&gt;</title>
    <link rel="self" href="https://atom.example.com/self/1"/>
    <link rel="alternate" href="https://atom.example.com/1"/>
    <id>urn:uuid:1</id>
    <updated>2026-10-25T08:00:00Z</updated>
    <summary>Atom summary text</summary>
    <author><name>Ada</name></author>
  </entry>
</feed>`;

describe("RSS / Atom parsing", () => {
  it("parses RSS 2.0", () => {
    const feed = parseFeed(RSS);
    expect(feed.title).toBe("Tech & Things");
    expect(feed.items).toHaveLength(2);
    const [a, b] = feed.items;
    expect(a).toMatchObject({ id: "post-2", title: "Second post", link: "https://example.com/2", image: "https://example.com/i2.jpg" });
    expect(a!.summary).toBe("Some bold news & more.");
    expect(b).toMatchObject({ id: "https://example.com/1", summary: "Plain summary", image: "https://example.com/i1.png" });
    expect(feedItemPayload(a!, feed)).toMatchObject({ title: "Second post", feedTitle: "Tech & Things", guid: "post-2" });
  });
  it("parses Atom", () => {
    const feed = parseFeed(ATOM);
    expect(feed.title).toBe("Atom Blog");
    expect(feed.link).toBe("https://atom.example.com/");
    expect(feed.items[0]).toMatchObject({
      id: "urn:uuid:1",
      title: "Atom entry",
      link: "https://atom.example.com/1",
      summary: "Atom summary text",
      author: "Ada",
      published: "2026-10-25T08:00:00Z",
    });
  });
  it("rejects non-feeds", () => {
    expect(() => parseFeed("<html><body>nope</body></html>")).toThrow(/Not a valid/);
  });
});

describe("dedupe", () => {
  const items = [{ id: "c" }, { id: "b" }, { id: "a" }];
  it("first sight: everything is fresh, oldest first", () => {
    const r = dedupeItems(items, []);
    expect(r.fresh.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(r.seen).toEqual(["c", "b", "a"]);
  });
  it("only unseen items are fresh", () => {
    const r = dedupeItems([{ id: "d" }, ...items], ["c", "b", "a"]);
    expect(r.fresh.map((i) => i.id)).toEqual(["d"]);
    expect(r.seen.slice(0, 2)).toEqual(["d", "c"]);
  });
  it("caps the seen list and ignores duplicates within a batch", () => {
    const r = dedupeItems([{ id: "x" }, { id: "x" }], ["1", "2", "3"], 3);
    expect(r.fresh).toHaveLength(1);
    expect(r.seen).toEqual(["x", "1", "2"]);
  });
});

describe("misc", () => {
  it("offline caption has hook, CTA and two hashtags, deterministically", () => {
    const a = offlineCaption("Async updates help remote teams ship faster. Weekly demos keep everyone aligned.", "Acme");
    expect(a).toBe(offlineCaption("Async updates help remote teams ship faster. Weekly demos keep everyone aligned.", "Acme"));
    expect((a.match(/#\w+/g) ?? []).length).toBe(2);
    expect(a.split("\n").length).toBeGreaterThan(3);
  });
  it("SSRF guard flags private ranges", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });
  it("woo product mapping + auth url", () => {
    expect(
      toProductPayload({ id: 7, name: "Tote", permalink: "https://s/p", price: "9", short_description: "<p>Nice &amp; strong</p>", images: [{ src: "https://s/i.jpg" }] }),
    ).toEqual({ id: "7", name: "Tote", permalink: "https://s/p", price: "9", short_description: "Nice & strong", images: ["https://s/i.jpg"], image: "https://s/i.jpg" });
    const https = wooProductsUrl("https://shop.example/", { consumerKey: "ck", consumerSecret: "cs" });
    expect(https.url).toContain("/wp-json/wc/v3/products?status=publish&orderby=date");
    expect(https.headers.authorization).toMatch(/^Basic /);
    expect(wooProductsUrl("http://localhost:8080", { consumerKey: "ck", consumerSecret: "cs" }).url).toContain("consumer_key=ck");
  });
});

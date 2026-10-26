import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { XMLParser } from "fast-xml-parser";
import { decodeEntities, stripHtml } from "./template";

// ───────────────────────── SSRF-guarded fetch (mirrors packages/integrations/src/ssrf.ts) ─────────────────────────

export class UnsafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeFetchError";
  }
}

function privateAllowed(): boolean {
  return process.env.ALLOW_PRIVATE_FETCH === "1" || process.env.ALLOW_PRIVATE_WEBHOOKS === "1";
}

function v4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    n = n * 256 + Number(p);
  }
  return n;
}

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const n = v4ToInt(ip);
    if (n === null) return true;
    return BLOCKED_V4.some(([base, bits]) => {
      const b = v4ToInt(base)!;
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return ((n & mask) >>> 0) === ((b & mask) >>> 0);
    });
  }
  if (v === 6) {
    const a = ip.toLowerCase();
    if (a === "::" || a === "::1") return true;
    const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (mapped) return isPrivateIp(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|fec|fed|fee|fef|ff)/.test(a);
  }
  return true;
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeFetchError(`Invalid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeFetchError("Only http(s) URLs are allowed");
  if (url.username || url.password) throw new UnsafeFetchError("URLs with embedded credentials are not allowed");
  if (privateAllowed()) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || /\.(localhost|internal|local)$/.test(host)) throw new UnsafeFetchError(`Refusing to fetch private host ${host}`);
  let addrs: string[];
  if (isIP(host)) addrs = [host];
  else {
    try {
      addrs = (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
    } catch {
      throw new UnsafeFetchError(`Could not resolve host ${host}`);
    }
  }
  if (!addrs.length) throw new UnsafeFetchError(`Could not resolve host ${host}`);
  const bad = addrs.find(isPrivateIp);
  if (bad) throw new UnsafeFetchError(`Refusing to fetch ${host}: private address`);
  return url;
}

const MAX_BYTES = 3 * 1024 * 1024;

/** GET with SSRF guard on every redirect hop, 15s timeout and a 3 MB body cap. Returns the body text. */
export async function safeFetchText(
  rawUrl: string,
  init: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<{ status: number; text: string; url: string }> {
  let current = rawUrl;
  for (let hop = 0; hop < 4; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": "OcoyaCloneBot/1.0 (+workflows)", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new Error("Response is too large");
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error("Response is too large");
    return { status: res.status, text: new TextDecoder().decode(buf), url: url.toString() };
  }
  throw new Error("Too many redirects");
}

// ───────────────────────── Feed parsing (RSS 2.0 + Atom) ─────────────────────────

export interface FeedItem {
  /** Stable dedupe key: guid / atom id / link / title. */
  id: string;
  title: string;
  link: string;
  summary: string;
  published: string | null;
  image: string | null;
  author: string;
}

export interface ParsedFeed {
  title: string;
  link: string;
  items: FeedItem[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  removeNSPrefix: false,
  processEntities: false,
  htmlEntities: false,
  trimValues: true,
  parseTagValue: false,
  cdataPropName: "#cdata",
});

const arr = <T>(v: T | T[] | undefined | null): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

/** Text content of a parsed node (string, {#text}, {#cdata}, or array thereof). */
function text(node: unknown): string {
  if (node === undefined || node === null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (o["#cdata"] !== undefined) return text(o["#cdata"]);
    if (o["#text"] !== undefined) return text(o["#text"]);
  }
  return "";
}

const clean = (s: string) => decodeEntities(s).trim();

function atomLink(links: unknown): string {
  const list = arr(links as Record<string, unknown> | Array<Record<string, unknown>>);
  const pick =
    list.find((l) => typeof l === "object" && l && (!l["@_rel"] || l["@_rel"] === "alternate")) ?? list[0];
  if (!pick) return "";
  if (typeof pick === "string") return pick;
  return String((pick as Record<string, unknown>)["@_href"] ?? text(pick));
}

function mediaImage(item: Record<string, unknown>): string | null {
  for (const key of ["media:content", "media:thumbnail", "enclosure"]) {
    for (const m of arr(item[key] as Record<string, unknown> | Array<Record<string, unknown>>)) {
      if (!m || typeof m !== "object") continue;
      const url = m["@_url"];
      const type = String(m["@_type"] ?? m["@_medium"] ?? "image");
      if (typeof url === "string" && url && (type.startsWith("image") || key === "media:thumbnail")) return url;
    }
  }
  const group = item["media:group"] as Record<string, unknown> | undefined;
  if (group && typeof group === "object") return mediaImage(group);
  // First <img> in the HTML body.
  const html = text(item["content:encoded"]) || text(item.description) || text(item.content) || text(item.summary);
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(decodeEntities(html));
  return m ? m[1]! : null;
}

export function parseFeed(xml: string): ParsedFeed {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Not a valid RSS/Atom feed (${err instanceof Error ? err.message : "parse error"})`);
  }

  const rss = doc.rss as Record<string, unknown> | undefined;
  const rdf = doc["rdf:RDF"] as Record<string, unknown> | undefined;
  if (rss || rdf) {
    const channel = ((rss?.channel ?? rdf?.channel) ?? {}) as Record<string, unknown>;
    const rawItems = arr((channel.item ?? rdf?.item) as Record<string, unknown> | Array<Record<string, unknown>>);
    const items = rawItems.map((it): FeedItem => {
      const title = stripHtml(decodeEntities(text(it.title)));
      const link = clean(text(it.link)) || (typeof it.guid === "object" ? "" : clean(text(it.guid)));
      const guid = clean(text(it.guid));
      const html = text(it.description) || text(it["content:encoded"]);
      return {
        id: guid || link || title,
        title,
        link,
        summary: stripHtml(decodeEntities(html)).slice(0, 1500),
        published: clean(text(it.pubDate) || text(it["dc:date"])) || null,
        image: mediaImage(it),
        author: clean(text(it.author) || text(it["dc:creator"])),
      };
    });
    return { title: clean(text(channel.title)), link: clean(text(channel.link)), items: items.filter((i) => i.id) };
  }

  const feed = doc.feed as Record<string, unknown> | undefined;
  if (feed) {
    const entries = arr(feed.entry as Record<string, unknown> | Array<Record<string, unknown>>);
    const items = entries.map((e): FeedItem => {
      const title = stripHtml(decodeEntities(text(e.title)));
      const link = atomLink(e.link);
      const id = clean(text(e.id));
      const html = text(e.summary) || text(e.content);
      const author = e.author as Record<string, unknown> | undefined;
      return {
        id: id || link || title,
        title,
        link,
        summary: stripHtml(decodeEntities(html)).slice(0, 1500),
        published: clean(text(e.published) || text(e.updated)) || null,
        image: mediaImage(e),
        author: author ? clean(text(arr(author)[0] && (arr(author)[0] as Record<string, unknown>).name)) : "",
      };
    });
    return { title: clean(text(feed.title)), link: atomLink(feed.link), items: items.filter((i) => i.id) };
  }

  throw new Error("Not a valid RSS/Atom feed (no <rss>, <rdf:RDF> or <feed> root)");
}

export const SEEN_CAP = 500;

/**
 * Split feed items into new (not in `seen`) ones, oldest first, and return the updated seen list
 * (newest ids first, capped at SEEN_CAP).
 */
export function dedupeItems<T extends { id: string }>(items: T[], seen: string[], cap = SEEN_CAP): { fresh: T[]; seen: string[] } {
  const seenSet = new Set(seen);
  const fresh: T[] = [];
  const batch = new Set<string>();
  for (const it of items) {
    if (seenSet.has(it.id) || batch.has(it.id)) continue;
    batch.add(it.id);
    fresh.push(it);
  }
  // Feeds list newest first; keep that order at the front of `seen`.
  const nextSeen = [...items.map((i) => i.id), ...seen].filter((id, i, a) => a.indexOf(id) === i).slice(0, cap);
  return { fresh: fresh.reverse(), seen: nextSeen };
}

/** Trigger payload for one feed item ({{trigger.title}}, {{trigger.link}}, ...). */
export function feedItemPayload(item: FeedItem, feed: Pick<ParsedFeed, "title">) {
  return {
    title: item.title,
    link: item.link,
    summary: item.summary,
    guid: item.id,
    published: item.published ?? "",
    image: item.image ?? "",
    author: item.author,
    feedTitle: feed.title,
  };
}

export async function fetchFeed(url: string): Promise<ParsedFeed> {
  const res = await safeFetchText(url, { headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" } });
  if (res.status >= 400) throw new Error(`Feed returned HTTP ${res.status}`);
  return parseFeed(res.text);
}

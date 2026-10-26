// OWNED BY: ai agent. Server-only: fetch a website safely (SSRF guard, timeout, size cap) and extract brand signals.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const FETCH_TIMEOUT_MS = 15_000;
export const FETCH_MAX_BYTES = 2 * 1024 * 1024;
export const TEXT_CAP = 8000;
const MAX_REDIRECTS = 5;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (cloud metadata)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

/** True for loopback, private, link-local, CGNAT, multicast, reserved and unspecified addresses (v4 and v6). */
export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (kind === 6) {
    const lower = ip.toLowerCase().split("%")[0] ?? "";
    // IPv4-mapped / -compatible (::ffff:1.2.3.4, ::1.2.3.4)
    const v4 = lower.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (v4?.[1]) return isPrivateIp(v4[1]);
    const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex?.[1] && mappedHex[2]) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    if (lower === "::" || lower === "::1") return true;
    const first = parseInt(lower.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (lower.startsWith("64:ff9b:")) return true; // NAT64 — could reach internal v4
    if (lower.startsWith("2001:db8:")) return true; // documentation
    return false;
  }
  return true; // not an IP at all → treat as unsafe
}

export type Resolver = (host: string) => Promise<string[]>;

const defaultResolver: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** Validate scheme/host and that every resolved address is public. Returns the parsed URL. */
export async function assertPublicUrl(raw: string, resolve: Resolver = defaultResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new UnsafeUrlError("Invalid website URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Only http(s) URLs are allowed");
  if (url.username || url.password) throw new UnsafeUrlError("URLs with credentials are not allowed");
  if (process.env.ALLOW_PRIVATE_FETCH === "1") return url;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new UnsafeUrlError("This address is not allowed");
  }
  let addresses: string[];
  if (isIP(host)) addresses = [host];
  else {
    try {
      addresses = await resolve(host);
    } catch {
      throw new UnsafeUrlError(`Could not resolve ${host}`);
    }
  }
  if (addresses.length === 0 || addresses.some(isPrivateIp)) throw new UnsafeUrlError("This address is not allowed");
  return url;
}

export interface FetchedPage {
  url: string;
  html: string;
}

async function readCapped(res: Response, cap: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < cap) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = cap - total;
    const part = value.byteLength > room ? value.subarray(0, room) : value;
    chunks.push(part);
    total += part.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

/** Fetch an HTML page with SSRF checks on every redirect hop, a 15s timeout and a 2MB body cap. */
export async function fetchPage(
  rawUrl: string,
  opts: { resolve?: Resolver; fetchImpl?: typeof fetch; timeoutMs?: number; maxBytes?: number } = {},
): Promise<FetchedPage> {
  const doFetch = opts.fetchImpl ?? fetch;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? FETCH_TIMEOUT_MS);
  let url = await assertPublicUrl(rawUrl, opts.resolve);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await doFetch(url.toString(), {
        redirect: "manual",
        signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; PostlineBot/1.0; +https://postline.app)",
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        },
      });
    } catch (e) {
      if ((e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError") {
        throw new Error("The website took too long to respond");
      }
      throw new Error(`Could not fetch the website: ${(e as Error)?.message ?? "network error"}`);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`Website redirect without a location (HTTP ${res.status})`);
      url = await assertPublicUrl(new URL(loc, url).toString(), opts.resolve);
      continue;
    }
    if (!res.ok) throw new Error(`The website returned HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml|text\/plain/i.test(type)) throw new Error(`The website did not return HTML (${type})`);
    return { url: url.toString(), html: await readCapped(res, opts.maxBytes ?? FETCH_MAX_BYTES) };
  }
  throw new Error("Too many redirects");
}

// ---------------------------------------------------------------- extraction (pure)

export interface BrandSignals {
  title?: string;
  description?: string;
  siteName?: string;
  ogImage?: string;
  logoUrls: string[];
  colors: string[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    const lower = e.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16) || 32);
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10) || 32);
    return ENTITIES[lower] ?? m;
  });
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[(m[1] as string).toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

function absolute(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Normalise #rgb / #rgba / #rrggbb / #rrggbbaa to lowercase #rrggbb. */
export function normalizeHex(hex: string): string | undefined {
  let h = hex.replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]+$/.test(h)) return undefined;
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
  else if (h.length === 8) h = h.slice(0, 6);
  else if (h.length !== 6) return undefined;
  return `#${h}`;
}

/** Near-white or near-black (relative luminance outside 0.08–0.92). */
export function isNearWhiteOrBlack(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.92 || lum < 0.08;
}

/** Top `limit` colours by frequency from CSS text (theme-color first when given). */
export function extractColors(css: string, themeColor?: string, limit = 5): string[] {
  const counts = new Map<string, number>();
  for (const m of css.matchAll(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g)) {
    const hex = normalizeHex(m[1] as string);
    if (!hex || isNearWhiteOrBlack(hex)) continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  const theme = themeColor ? normalizeHex(themeColor.trim()) : undefined;
  const out = theme && !isNearWhiteOrBlack(theme) ? [theme, ...ranked.filter((h) => h !== theme)] : ranked;
  return out.slice(0, limit);
}

/** Visible text: drop scripts/styles/svg/etc., strip tags, decode entities, collapse whitespace, cap length. */
export function extractVisibleText(html: string, cap = TEXT_CAP): string {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const text = body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|canvas|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const cleaned = decodeEntities(text)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return cleaned.length > cap ? cleaned.slice(0, cap) : cleaned;
}

export function extractBrandSignals(html: string, baseUrl: string): BrandSignals {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const meta = (key: string) =>
    metas.find((a) => (a.name ?? a.property ?? "").toLowerCase() === key)?.content?.trim() || undefined;

  const logos: string[] = [];
  const push = (u?: string) => {
    if (u && !logos.includes(u)) logos.push(u);
  };
  // <img> tags that look like a logo come first; then touch icons; then favicons.
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const hay = `${a.src ?? ""} ${a.alt ?? ""} ${a.class ?? ""} ${a.id ?? ""}`.toLowerCase();
    if (hay.includes("logo")) push(absolute(a.src ?? a["data-src"], baseUrl));
  }
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => attrs(m[0]));
  for (const rel of ["apple-touch-icon", "apple-touch-icon-precomposed", "icon", "shortcut icon", "mask-icon"]) {
    for (const l of links) if ((l.rel ?? "").toLowerCase() === rel) push(absolute(l.href, baseUrl));
  }
  const ogLogo = meta("og:logo");
  push(absolute(ogLogo, baseUrl));
  const ogImage = absolute(meta("og:image") ?? meta("twitter:image"), baseUrl);

  const css = [
    ...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1] ?? ""),
    ...[...html.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => m[1] ?? m[2] ?? ""),
  ].join("\n");

  return {
    title: title ? decodeEntities(title).replace(/\s+/g, " ").trim() || undefined : undefined,
    description: meta("description") ?? meta("og:description") ?? meta("twitter:description"),
    siteName: meta("og:site_name") ?? meta("application-name"),
    ogImage,
    logoUrls: logos.slice(0, 8),
    colors: extractColors(css, meta("theme-color")),
    text: extractVisibleText(html),
  };
}

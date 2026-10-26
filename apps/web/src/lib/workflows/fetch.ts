import "server-only";
// SSRF-guarded fetch + WooCommerce verify. Mirrors apps/worker/src/lib/{rss,woo}.ts (web cannot import worker code).
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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

export interface WooCredentials {
  consumerKey: string;
  consumerSecret: string;
}

/** Verify keys by listing one product. Returns the normalized store URL. */
export async function verifyWooStore(rawUrl: string, creds: WooCredentials): Promise<string> {
  const base = rawUrl.trim().replace(/\/+$/, "");
  const u = new URL(`${base}/wp-json/wc/v3/products`);
  u.searchParams.set("per_page", "1");
  const headers: Record<string, string> = { accept: "application/json" };
  if (u.protocol === "https:") headers.authorization = `Basic ${Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString("base64")}`;
  else {
    u.searchParams.set("consumer_key", creds.consumerKey);
    u.searchParams.set("consumer_secret", creds.consumerSecret);
  }
  let res: { status: number; text: string };
  try {
    res = await safeFetchText(u.toString(), { headers, timeoutMs: 12_000 });
  } catch (err) {
    if (err instanceof UnsafeFetchError) throw err;
    throw new Error("Couldn't reach the store. Check the URL and that the WooCommerce REST API is enabled.");
  }
  if (res.status === 401 || res.status === 403) throw new Error("The store rejected these API keys. Use a key with Read permission.");
  if (res.status === 404) throw new Error("No WooCommerce API found at this URL.");
  if (res.status >= 400) throw new Error(`The store answered with HTTP ${res.status}.`);
  try {
    if (!Array.isArray(JSON.parse(res.text))) throw new Error();
  } catch {
    throw new Error("That URL didn't return WooCommerce data.");
  }
  return base;
}

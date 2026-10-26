// Server-only SSRF guard for user-supplied URLs (custom webhooks, Mastodon instances, Bluesky PDS).
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AdapterError } from "@postline/core";

export function privateTargetsAllowed(): boolean {
  return process.env.ALLOW_PRIVATE_WEBHOOKS === "1";
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

/** [network, prefix length] blocks that must never be reached from the server. */
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function inV4Block(ip: number, base: string, bits: number): boolean {
  const b = ipv4ToInt(base);
  if (b === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((ip & mask) >>> 0) === ((b & mask) >>> 0);
}

export function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparsable → treat as unsafe
  return BLOCKED_V4.some(([base, bits]) => inV4Block(n, base, bits));
}

/** Expand an IPv6 address to 8 16-bit groups (handles "::" and embedded IPv4). */
function expandIPv6(ip: string): number[] | null {
  let addr = ip.toLowerCase();
  const zone = addr.indexOf("%");
  if (zone >= 0) addr = addr.slice(0, zone);
  // Embedded dotted IPv4 tail
  const lastColon = addr.lastIndexOf(":");
  const tail = addr.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = ipv4ToInt(tail);
    if (v4 === null) return null;
    addr = `${addr.slice(0, lastColon + 1)}${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const parse = (s: string) => (s ? s.split(":").map((h) => parseInt(h, 16)) : []);
  const head = parse(halves[0] ?? "");
  const rest = halves.length === 2 ? parse(halves[1] ?? "") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  const groups = [...head, ...Array<number>(Math.max(0, fill)).fill(0), ...rest];
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff)) return null;
  return groups;
}

export function isPrivateIPv6(ip: string): boolean {
  const g = expandIPv6(ip);
  if (!g) return true;
  const [g0 = 0, g1 = 0, , , , g5 = 0, g6 = 0, g7 = 0] = g;
  const allZeroPrefix = g.slice(0, 5).every((x) => x === 0);
  if (allZeroPrefix && g5 === 0 && g6 === 0 && (g7 === 0 || g7 === 1)) return true; // :: and ::1
  const embeddedV4 = `${g6 >>> 8}.${g6 & 0xff}.${g7 >>> 8}.${g7 & 0xff}`;
  if (allZeroPrefix && g5 === 0xffff) return isPrivateIPv4(embeddedV4); // ::ffff:a.b.c.d (mapped)
  if (allZeroPrefix && g5 === 0) return isPrivateIPv4(embeddedV4); // ::a.b.c.d (compat, deprecated)
  if (g0 === 0x64 && g1 === 0xff9b) return isPrivateIPv4(embeddedV4); // NAT64 64:ff9b::/96
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((g0 & 0xff00) === 0xff00) return true; // multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation
  if (g0 === 0x2002) {
    // 6to4: embedded IPv4 in groups 1-2
    return isPrivateIPv4(`${g1 >>> 8}.${g1 & 0xff}.${(g[2] ?? 0) >>> 8}.${(g[2] ?? 0) & 0xff}`);
  }
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) return isPrivateIPv6(ip);
  return true;
}

export type LookupFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: LookupFn = (hostname) => lookup(hostname, { all: true, verbatim: true });

/**
 * Throw AdapterError("rejected") unless `rawUrl` is http(s) and every address its host resolves to is public.
 * Skipped entirely when ALLOW_PRIVATE_WEBHOOKS=1 (local development).
 * Note: there is a DNS-rebinding window between this check and the actual connection.
 */
export async function assertPublicUrl(
  rawUrl: string,
  opts: { lookupFn?: LookupFn; requireHttps?: boolean } = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AdapterError("rejected", `Invalid URL: ${rawUrl}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AdapterError("rejected", `Only http(s) URLs are allowed (got ${url.protocol})`);
  }
  if (url.username || url.password) throw new AdapterError("rejected", "URLs with embedded credentials are not allowed");
  if (privateTargetsAllowed()) return url;
  if (opts.requireHttps && url.protocol !== "https:") throw new AdapterError("rejected", "URL must use https");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new AdapterError("rejected", `Refusing to call private host ${host}`);
  }
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await (opts.lookupFn ?? defaultLookup)(host)).map((a) => a.address);
    } catch {
      throw new AdapterError("rejected", `Could not resolve host ${host}`);
    }
  }
  if (addresses.length === 0) throw new AdapterError("rejected", `Could not resolve host ${host}`);
  const bad = addresses.find(isPrivateAddress);
  if (bad) throw new AdapterError("rejected", `Refusing to call ${host}: resolves to private address ${bad}`);
  return url;
}

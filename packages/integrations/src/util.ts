// Server-only helpers shared by adapters.
import { createHash } from "node:crypto";
import {
  AdapterError,
  NETWORK_LABELS,
  NETWORK_LIMITS,
  splitIntoThread,
  type ComposedPost,
  type Credentials,
  type MediaItem,
  type Network,
} from "@postline/core";
import { validateForNetwork } from "./rules";
import { MB } from "./http";

export function credString(c: Credentials, key: string): string | undefined {
  const v = c[key];
  return typeof v === "string" && v ? v : undefined;
}

/** Missing stored credentials mean the channel must be reconnected. */
export function requireCred(c: Credentials, key: string, network: Network): string {
  const v = credString(c, key);
  if (!v) throw new AdapterError("auth", `${NETWORK_LABELS[network]} credentials are missing "${key}"; reconnect the channel`);
  return v;
}

/** Required form field (connect forms). */
export function requireField(fields: Record<string, string>, name: string, label: string): string {
  const v = fields[name]?.trim();
  if (!v) throw new AdapterError("rejected", `${label} is required`);
  return v;
}

export function optionalField(fields: Record<string, string>, name: string): string | undefined {
  const v = fields[name]?.trim();
  return v ? v : undefined;
}

/** Throw AdapterError("rejected") if the post has blocking validation errors. */
export function assertValid(network: Network, post: Pick<ComposedPost, "caption" | "media" | "options">): void {
  const errors = validateForNetwork(network, post).filter((i) => i.level === "error");
  if (errors.length > 0) throw new AdapterError("rejected", errors.map((e) => e.message).join("; "), { body: errors });
}

/** Thread parts for networks with captionHard. `options.threadNumbering === false` disables " i/n". */
export function threadParts(network: Network, post: Pick<ComposedPost, "caption" | "options">): string[] {
  const numbering = post.options.threadNumbering !== false;
  return splitIntoThread(network, post.caption, { numbering });
}

export function maxBytesFor(network: Network, m: Pick<MediaItem, "mime">): number {
  const limits = NETWORK_LIMITS[network];
  const isVideo = m.mime.toLowerCase().startsWith("video/");
  return (isVideo ? limits.videoMaxBytes : limits.imageMaxBytes) ?? 100 * MB;
}

export function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function pkceChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

export function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 24);
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new AdapterError("rejected", `${name} is not configured on the server`);
  return v;
}

export function expiresAtFrom(expiresInSec: unknown): number | undefined {
  return typeof expiresInSec === "number" && expiresInSec > 0 ? Date.now() + expiresInSec * 1000 : undefined;
}

/** Every part of a thread to delete, replies first and root last (a partial failure leaves the root visible). */
export function deletionOrder(externalId: string, partIds?: string[]): string[] {
  const ids = partIds && partIds.length ? [...partIds] : [externalId];
  if (!ids.includes(externalId)) ids.unshift(externalId);
  return [...new Set(ids)].reverse();
}

export function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

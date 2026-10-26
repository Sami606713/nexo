// OWNED BY: web-platform agent. OAuth state cookie (HMAC-signed with AUTH_SECRET) + PKCE.
import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NETWORKS, type Network } from "@postline/core";
import { appUrl } from "./mail";

export const OAUTH_COOKIE = "pl_oauth";
export const OAUTH_TTL_SEC = 600;

export interface OAuthState {
  state: string;
  codeVerifier: string;
  brandId: string;
  network: Network;
  userId: string;
  exp: number;
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

export function encodeState(s: OAuthState): string {
  const data = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function decodeState(raw: string | undefined): OAuthState | null {
  if (!raw) return null;
  const [data, sig] = raw.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(data));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as OAuthState;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** RFC 7636 S256 challenge — exported for adapters that want it (they receive the verifier). */
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** URL segment → Network (case-insensitive, accepts dashes). */
export function parseNetwork(segment: string): Network | null {
  const n = segment.toUpperCase().replace(/-/g, "_");
  return (NETWORKS as readonly string[]).includes(n) ? (n as Network) : null;
}

/** Must match what is registered with each network app. Lower-case network segment. */
export const oauthRedirectUri = (network: Network) => appUrl(`/api/channels/oauth/${network.toLowerCase()}/callback`);

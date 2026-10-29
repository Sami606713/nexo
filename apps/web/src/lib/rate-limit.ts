import "server-only";
import { HttpError } from "./http";
import { connection } from "./queue";

/**
 * Abuse limits, shared by every server instance through Redis (fixed windows).
 * Credits cap how much AI a user gets per month; these cap how fast, so one account or script can't burn
 * through AI spend or create accounts in bulk.
 */
export const LIMITS = {
  /** AI text: captions, rewrites, hashtags, scores, reply suggestions, agent tests. */
  ai: { max: 20, windowSec: 60, message: "You're using AI very quickly. Please wait a minute and try again." },
  /** AI images, counted per image. */
  image: { max: 12, windowSec: 60, message: "You're generating images very quickly. Please wait a minute and try again." },
  imageDaily: { max: 100, windowSec: 86_400, message: "You've reached today's image limit. Please try again tomorrow." },
  campaign: { max: 5, windowSec: 3_600, message: "You've started several campaigns in the last hour. Please try again later." },
  /** Per IP address. */
  signup: { max: 5, windowSec: 3_600, message: "Too many sign-ups from your network. Please try again in an hour." },
  signupDaily: { max: 20, windowSec: 86_400, message: "Too many sign-ups from your network today. Please try again tomorrow." },
  /** Per IP + email: slows down password guessing. */
  login: { max: 10, windowSec: 900, message: "Too many sign-in attempts. Please wait 15 minutes." },
  contact: { max: 5, windowSec: 600, message: "Too many messages. Please try again in a few minutes." },
} as const;

export type LimitName = keyof typeof LIMITS;

export interface LimitResult {
  ok: boolean;
  /** Seconds until the window resets (when blocked). */
  retryAfter: number;
}

let warned = false;

/** Count `cost` against `name` for `id`. Fails open: if Redis is down, requests are allowed (and logged once). */
export async function rateLimit(name: LimitName, id: string, cost = 1): Promise<LimitResult> {
  const { max, windowSec } = LIMITS[name];
  const window = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl:${name}:${id}:${window}`;
  try {
    const res = await connection().multi().incrby(key, cost).expire(key, windowSec + 5).exec();
    const count = Number(res?.[0]?.[1] ?? 0);
    const retryAfter = windowSec - (Math.floor(Date.now() / 1000) % windowSec);
    return { ok: count <= max, retryAfter };
  } catch (err) {
    if (!warned) {
      warned = true;
      console.error("[rate-limit] Redis unavailable; limits are not enforced", err);
    }
    return { ok: true, retryAfter: 0 };
  }
}

/** Throw a 429 with a friendly message when over the limit. */
export async function enforceRateLimit(name: LimitName, id: string, cost = 1): Promise<void> {
  const r = await rateLimit(name, id, cost);
  if (!r.ok) throw new HttpError(429, LIMITS[name].message, { retryAfter: r.retryAfter });
}

/** Caller's IP (Vercel sets x-forwarded-for / x-real-ip). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

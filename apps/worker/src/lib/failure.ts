import { AdapterError, type AdapterErrorKind } from "@postline/core";

export const PUBLISH_POST_ATTEMPTS = 5;
export const PUBLISH_POST_BACKOFF_MS = 30_000;
/** Custom backoff type name registered on the publish-post worker. */
export const PUBLISH_BACKOFF_TYPE = "postline";

export interface PostErrorJson {
  kind: AdapterErrorKind | "validation" | "unsupported";
  message: string;
  details?: unknown;
  /** Whether the worker will try again. */
  willRetry?: boolean;
  at?: string;
}

export type FailureAction =
  /** Rethrow → BullMQ retries after `delayMs` (or default backoff). Post stays PUBLISHING. */
  | { action: "retry"; error: PostErrorJson; delayMs?: number }
  /** Terminal: Post ERROR, no retry. */
  | { action: "fail"; error: PostErrorJson }
  /** Terminal: Post ERROR + channel NEEDS_RECONNECT + notify admins. */
  | { action: "reconnect"; error: PostErrorJson };

export function isAdapterError(err: unknown): err is AdapterError {
  if (err instanceof AdapterError) return true;
  // Tolerate duplicate module instances (e.g. different import paths): duck-type.
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "AdapterError" &&
    typeof (err as { kind?: unknown }).kind === "string"
  );
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Map a publish failure to the worker's action.
 * @param attemptsMade attempts already finished BEFORE the current one (BullMQ `job.attemptsMade`).
 * @param maxAttempts  `job.opts.attempts`.
 */
export function classifyFailure(err: unknown, attemptsMade: number, maxAttempts: number): FailureAction {
  const kind: AdapterErrorKind = isAdapterError(err) ? err.kind : "transient";
  const details = isAdapterError(err) ? err.details : undefined;
  const message = messageOf(err);

  switch (kind) {
    case "auth":
      return { action: "reconnect", error: { kind, message, details } };
    case "rejected":
      return { action: "fail", error: { kind, message, details } };
    case "unknown":
      return {
        action: "fail",
        error: { kind, message: `${message} — may have published — check the network before retrying`, details },
      };
    case "rate_limit":
    case "transient": {
      const isLast = attemptsMade + 1 >= Math.max(1, maxAttempts);
      if (isLast) {
        return { action: "fail", error: { kind, message: `${message} (gave up after ${attemptsMade + 1} attempts)`, details } };
      }
      const retryAfter = details?.retryAfterSec;
      const delayMs = typeof retryAfter === "number" && retryAfter > 0 ? retryAfter * 1000 : undefined;
      return { action: "retry", error: { kind, message, details, willRetry: true }, delayMs };
    }
  }
}

/**
 * Backoff for publish-post retries: honour `retryAfterSec` from rate-limit errors, otherwise
 * exponential from `baseMs` (30s, 60s, 120s, ...). `attemptsMade` is 1 after the first failure.
 * Capped at 1h.
 */
export function computeBackoffMs(attemptsMade: number, err: unknown, baseMs = PUBLISH_POST_BACKOFF_MS): number {
  if (isAdapterError(err)) {
    const ra = err.details?.retryAfterSec;
    if (typeof ra === "number" && ra > 0) return Math.min(ra * 1000, 3600_000);
  }
  const n = Math.max(1, attemptsMade);
  return Math.min(baseMs * 2 ** (n - 1), 3600_000);
}

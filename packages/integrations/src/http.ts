// Server-only HTTP helpers shared by adapters: timeouts, error mapping, media download.
import { AdapterError, type AdapterErrorKind } from "@postline/core";

export const DEFAULT_TIMEOUT_MS = 30_000;
export const MB = 1024 * 1024;

export type StatusClassifier = (status: number, body: unknown) => AdapterErrorKind | undefined;

export interface HttpOptions extends Omit<RequestInit, "signal" | "body"> {
  body?: BodyInit | null;
  /** Serialized as JSON with `Content-Type: application/json`. */
  json?: unknown;
  timeoutMs?: number;
  /**
   * Whether repeating the request can't duplicate a side effect. Decides how an ambiguous network failure
   * (timeout / reset mid-request) is classified: idempotent → "transient", otherwise → "unknown".
   * Defaults to true for GET/HEAD/PUT/DELETE, false for POST/PATCH.
   */
  idempotent?: boolean;
  /** Network name used in error messages. */
  label?: string;
  /** Per-network override of the status → kind mapping (return undefined to fall back to the default). */
  classify?: StatusClassifier;
}

/** Error codes that mean the request never reached the server, so retrying is always safe. */
const PRE_SEND_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_CONNECT",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

function errorCode(err: unknown): string | undefined {
  let e: unknown = err;
  for (let i = 0; i < 4 && e && typeof e === "object"; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

function isTimeout(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  return name === "TimeoutError" || name === "AbortError";
}

/** Map a thrown fetch error (no HTTP response) to an AdapterError. */
export function networkError(err: unknown, idempotent: boolean, label = "Request"): AdapterError {
  if (err instanceof AdapterError) return err;
  const code = errorCode(err);
  if (code && PRE_SEND_CODES.has(code)) {
    return new AdapterError("transient", `${label}: could not connect (${code})`);
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (isTimeout(err)) {
    return idempotent
      ? new AdapterError("transient", `${label}: request timed out`)
      : new AdapterError("unknown", `${label}: request timed out after sending; the post may have been published`);
  }
  return idempotent
    ? new AdapterError("transient", `${label}: network error (${code ?? msg})`)
    : new AdapterError("unknown", `${label}: network error after sending (${code ?? msg}); the post may have been published`);
}

export function defaultKind(status: number): AdapterErrorKind {
  if (status === 401) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 408 || status >= 500) return "transient";
  return "rejected";
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** Seconds to wait, from Retry-After / X-RateLimit-Reset style headers (or Discord/Telegram bodies). */
export function parseRetryAfter(headers: Headers, body?: unknown, now = Date.now()): number | undefined {
  const fromValue = (raw: string | null, resetStyle: boolean): number | undefined => {
    if (!raw) return undefined;
    const n = num(raw);
    if (n !== undefined) {
      // Epoch seconds (X, Bluesky) vs delta seconds.
      if (resetStyle && n > 1_000_000_000) return (n * 1000 - now) / 1000;
      return n;
    }
    const date = Date.parse(raw); // HTTP-date or ISO (Mastodon)
    return Number.isNaN(date) ? undefined : (date - now) / 1000;
  };
  let sec =
    fromValue(headers.get("retry-after"), false) ??
    fromValue(headers.get("x-rate-limit-reset"), true) ??
    fromValue(headers.get("x-ratelimit-reset"), true) ??
    fromValue(headers.get("ratelimit-reset"), true);
  if (sec === undefined && body && typeof body === "object") {
    const b = body as { retry_after?: unknown; parameters?: { retry_after?: unknown } };
    sec = num(b.retry_after) ?? num(b.parameters?.retry_after);
  }
  if (sec === undefined) return undefined;
  return Math.max(1, Math.ceil(sec));
}

/** Best-effort human message from an API error body. */
export function extractMessage(body: unknown): string {
  if (body == null) return "";
  if (typeof body === "string") return body.slice(0, 300);
  if (typeof body !== "object") return String(body);
  const b = body as Record<string, unknown>;
  const pick = (v: unknown): string | undefined => {
    if (typeof v === "string" && v) return v;
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.message === "string") return o.message;
    }
    return undefined;
  };
  const errors = Array.isArray(b.errors) ? b.errors.map(pick).filter(Boolean).join("; ") : undefined;
  const msg =
    pick(b.error_description) ??
    pick(b.detail) ??
    pick(b.description) ??
    pick(b.message) ??
    (errors || undefined) ??
    pick(b.error) ??
    pick(b.title) ??
    JSON.stringify(body);
  return msg.slice(0, 300);
}

export function httpError(
  res: Pick<Response, "status" | "headers">,
  body: unknown,
  label = "Request",
  classify?: StatusClassifier,
): AdapterError {
  const kind = classify?.(res.status, body) ?? defaultKind(res.status);
  const retryAfterSec = kind === "rate_limit" || kind === "transient" ? parseRetryAfter(res.headers, body) : undefined;
  const detail = extractMessage(body);
  return new AdapterError(kind, `${label} ${res.status}${detail ? `: ${detail}` : ""}`, {
    status: res.status,
    body,
    ...(retryAfterSec !== undefined ? { retryAfterSec } : {}),
  });
}

/** Read a response body as JSON when possible, otherwise text. Never throws. */
export async function readBody(res: Response): Promise<unknown> {
  let text: string;
  try {
    text = await res.text();
  } catch {
    return undefined;
  }
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function defaultIdempotent(method: string | undefined): boolean {
  const m = (method ?? "GET").toUpperCase();
  return m === "GET" || m === "HEAD" || m === "PUT" || m === "DELETE" || m === "OPTIONS";
}

/** fetch with a timeout; maps thrown network errors to AdapterError. Does not check the status. */
export async function request(url: string, opts: HttpOptions = {}): Promise<Response> {
  const { json, timeoutMs = DEFAULT_TIMEOUT_MS, idempotent, label = "Request", classify: _classify, ...init } = opts;
  void _classify;
  const headers = new Headers(init.headers);
  let body = init.body;
  if (json !== undefined) {
    body = JSON.stringify(json);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  if (!headers.has("accept")) headers.set("accept", "application/json");
  try {
    return await fetch(url, { ...init, headers, body, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw networkError(err, idempotent ?? defaultIdempotent(init.method), label);
  }
}

/** Request + parse; throws a mapped AdapterError for non-2xx responses. */
export async function fetchJson<T = unknown>(url: string, opts: HttpOptions = {}): Promise<T> {
  const res = await request(url, opts);
  const body = await readBody(res);
  if (!res.ok) throw httpError(res, body, opts.label, opts.classify);
  return body as T;
}

/** Like fetchJson but also returns the response (for headers such as LinkedIn's x-restli-id). */
export async function fetchWithBody<T = unknown>(
  url: string,
  opts: HttpOptions = {},
): Promise<{ res: Response; body: T }> {
  const res = await request(url, opts);
  const body = await readBody(res);
  if (!res.ok) throw httpError(res, body, opts.label, opts.classify);
  return { res, body: body as T };
}

export interface DownloadedMedia {
  data: Uint8Array<ArrayBuffer>;
  mime: string;
  filename: string;
  size: number;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export function filenameFor(url: string, mime: string, index = 0): string {
  let base = "";
  try {
    base = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    /* ignore */
  }
  base = base.replace(/[^\w.-]+/g, "_");
  if (base && /\.[a-z0-9]{2,5}$/i.test(base)) return base;
  return `media-${index + 1}.${EXT_BY_MIME[mime] ?? "bin"}`;
}

/** Download a media file into memory, refusing anything larger than `maxBytes`. */
export async function downloadMedia(
  url: string,
  opts: { maxBytes: number; mimeHint?: string; timeoutMs?: number; index?: number },
): Promise<DownloadedMedia> {
  const res = await request(url, { method: "GET", timeoutMs: opts.timeoutMs ?? 60_000, label: "Media download" });
  if (!res.ok) {
    const body = await readBody(res);
    // Our own storage: 404 means the asset is gone (no retry); 5xx is transient.
    throw httpError(res, body, `Media download (${url})`, (s) => (s === 401 || s === 403 ? "rejected" : undefined));
  }
  const declared = Number(res.headers.get("content-length") ?? "");
  const tooLarge = () =>
    new AdapterError("rejected", `Media file is larger than ${Math.round(opts.maxBytes / MB)} MB: ${url}`);
  if (Number.isFinite(declared) && declared > opts.maxBytes) throw tooLarge();

  const chunks: Uint8Array[] = [];
  let total = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      let r: ReadableStreamReadResult<Uint8Array>;
      try {
        r = await reader.read();
      } catch (err) {
        throw networkError(err, true, "Media download");
      }
      if (r.done) break;
      total += r.value.byteLength;
      if (total > opts.maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      chunks.push(r.value);
    }
  }
  const data = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const c of chunks) {
    data.set(c, offset);
    offset += c.byteLength;
  }
  const headerMime = (res.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  const mime = opts.mimeHint || headerMime || "application/octet-stream";
  return { data, mime, size: total, filename: filenameFor(url, mime, opts.index ?? 0) };
}

/** Wrap bytes as a Blob for multipart uploads. */
export function toBlob(m: Pick<DownloadedMedia, "data" | "mime">): Blob {
  return new Blob([m.data], { type: m.mime });
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

import "server-only";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Media storage behind a small interface.
 *
 * - `local` (default / MVP): writes to `apps/web/public/uploads/<key>` and serves at `${APP_URL}/uploads/<key>`.
 * - `s3`: TODO — S3-compatible PUT via fetch + AWS SigV4 (no aws-sdk). Selected when S3_BUCKET is set;
 *   until implemented it falls back to local with a warning.
 */
export interface StoredObject {
  key: string;
  url: string;
}

export interface StorageDriver {
  readonly name: "local" | "s3";
  put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
}

function appUrl() {
  return (process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")).replace(/\/+$/, "");
}

function safeKey(key: string) {
  const normalized = path.posix.normalize(key).replace(/^(\.\.(\/|$))+/, "");
  if (normalized.startsWith("/") || normalized.includes("..")) throw new Error("Invalid storage key");
  return normalized;
}

const localDriver: StorageDriver = {
  name: "local",
  async put(key, bytes) {
    const k = safeKey(key);
    const abs = path.join(process.cwd(), "public", "uploads", k);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
    return { key: k, url: `${appUrl()}/uploads/${k}` };
  },
  async delete(key) {
    const abs = path.join(process.cwd(), "public", "uploads", safeKey(key));
    await unlink(abs).catch(() => undefined);
  },
};

// TODO(s3): implement `s3Driver` using fetch + SigV4 signing (S3_ENDPOINT, S3_BUCKET,
// S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY) and S3_PUBLIC_BASE_URL for public URLs.

let warned = false;
export function storage(): StorageDriver {
  if (process.env.S3_BUCKET && !warned) {
    warned = true;
    console.warn("[storage] S3 driver not implemented yet — using local uploads directory");
  }
  return localDriver;
}

export const MEDIA_RULES = {
  image: { mimes: ["image/jpeg", "image/png", "image/webp", "image/gif"], maxBytes: 20 * 1024 * 1024 },
  video: { mimes: ["video/mp4", "video/quicktime"], maxBytes: 200 * 1024 * 1024 },
} as const;

export const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

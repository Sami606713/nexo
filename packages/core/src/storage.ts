// Server-only media storage shared by the web app and the worker (import "@postline/core/storage").
//
// - `blob`: Vercel Blob, selected when BLOB_READ_WRITE_TOKEN is set (production: Vercel's filesystem is read-only).
//   Objects are public, so networks that download media themselves (Instagram, Facebook) can fetch them.
// - `local` (development): writes to apps/web/public/uploads/<key>, served at `${APP_URL}/uploads/<key>`.
import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, put } from "@vercel/blob";

export interface StoredObject {
  key: string;
  url: string;
}

export interface StorageDriver {
  readonly name: "local" | "blob";
  put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
}

export function appBaseUrl(): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return (process.env.APP_URL || (vercel ? `https://${vercel}` : "http://localhost:3000")).replace(/\/+$/, "");
}

export function safeKey(key: string): string {
  const normalized = path.posix.normalize(key).replace(/^(\.\.(\/|$))+/, "");
  if (normalized.startsWith("/") || normalized.includes("..")) throw new Error("Invalid storage key");
  return normalized;
}

/** apps/web/public/uploads, whether we run from apps/web (Next) or apps/worker. */
function uploadsDir(): string {
  if (process.env.UPLOADS_DIR) return process.env.UPLOADS_DIR;
  const cwd = process.cwd();
  const web = existsSync(path.join(cwd, "public")) ? cwd : path.resolve(cwd, "../web");
  return path.join(web, "public", "uploads");
}

const localDriver: StorageDriver = {
  name: "local",
  async put(key, bytes) {
    const k = safeKey(key);
    const abs = path.join(uploadsDir(), k);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
    return { key: k, url: `${appBaseUrl()}/uploads/${k}` };
  },
  async delete(key) {
    await unlink(path.join(uploadsDir(), safeKey(key))).catch(() => undefined);
  },
};

/**
 * The Blob token. Vercel names it BLOB_READ_WRITE_TOKEN by default, or <PREFIX>_READ_WRITE_TOKEN when the store was
 * connected with a custom prefix; tokens always start with "vercel_blob_rw_".
 */
export function blobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  return Object.entries(process.env).find(([k, v]) => k.endsWith("_READ_WRITE_TOKEN") && v?.startsWith("vercel_blob_rw_"))?.[1];
}

function blobDriver(token: string): StorageDriver {
  return {
    name: "blob",
    async put(key, bytes, contentType) {
      const k = safeKey(key);
      const res = await put(k, Buffer.from(bytes), { access: "public", contentType, addRandomSuffix: false, allowOverwrite: true, token });
      return { key: k, url: res.url };
    },
    async delete(key) {
      await del(safeKey(key), { token }).catch(() => undefined);
    },
  };
}

/** Vercel's filesystem is read-only: without a Blob store, fail with a message that says what to do. */
const unconfiguredDriver: StorageDriver = {
  name: "blob",
  async put() {
    throw new Error("Media storage isn't set up: connect a Vercel Blob store to this project (Storage > Blob), then redeploy.");
  },
  async delete() {},
};

export function storage(): StorageDriver {
  const token = blobToken();
  if (token) return blobDriver(token);
  return process.env.VERCEL ? unconfiguredDriver : localDriver;
}

import "server-only";

// Media storage lives in @postline/core/storage (shared with the worker): Vercel Blob in production, local files in dev.
export { storage, type StorageDriver, type StoredObject } from "@postline/core/storage";

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

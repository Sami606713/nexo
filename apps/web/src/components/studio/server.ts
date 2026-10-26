import "server-only";
import { randomUUID } from "node:crypto";
import { prisma, type Design } from "@postline/db";
import { badRequest, HttpError, notFound } from "@/lib/http";
import { storage } from "@/lib/storage";

export interface DesignDTO {
  id: string;
  name: string;
  format: string;
  width: number;
  height: number;
  previewUrl: string | null;
  createdAt: string;
  updatedAt: string;
  doc?: unknown;
}

export function toDesignDTO(d: Design, withDoc = false): DesignDTO {
  return {
    id: d.id,
    name: d.name,
    format: d.format,
    width: d.width,
    height: d.height,
    previewUrl: d.previewUrl,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    ...(withDoc ? { doc: d.doc } : {}),
  };
}

export async function loadDesign(brandId: string, designId: string): Promise<Design> {
  const d = await prisma.design.findFirst({ where: { id: designId, brandId, isTemplate: false } });
  if (!d) throw notFound("Design not found");
  return d;
}

const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/;

/** Decode a base64 image data URL, enforcing type and size. */
export function decodeDataUrl(dataUrl: string, maxBytes: number): { mime: string; bytes: Uint8Array } {
  const m = DATA_URL.exec(dataUrl);
  if (!m) throw badRequest("Expected a PNG/JPEG/WebP data URL");
  const bytes = new Uint8Array(Buffer.from(m[2]!, "base64"));
  if (bytes.byteLength === 0) throw badRequest("The image is empty");
  if (bytes.byteLength > maxBytes) throw new HttpError(413, `Image must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller`);
  return { mime: m[1]!, bytes };
}

/** Store a small JPEG/PNG thumbnail for a design and return its URL (cache-busted). */
export async function storeThumbnail(brandId: string, designId: string, dataUrl: string): Promise<string> {
  const { mime, bytes } = decodeDataUrl(dataUrl, 1.5 * 1024 * 1024);
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const stored = await storage().put(`${brandId}/studio/thumb-${designId}.${ext}`, bytes, mime);
  return `${stored.url}?v=${Date.now().toString(36)}`;
}

export const newKey = (brandId: string, ext: string) => `${brandId}/${randomUUID().replace(/-/g, "")}.${ext}`;

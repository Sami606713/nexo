// OWNED BY: campaigns/images agent. Generate images (credits charged) and store them as MediaAsset rows.
import "server-only";
import { randomUUID } from "node:crypto";
import { prisma, type MediaAsset } from "@postline/db";
import { images, withCredits } from "@postline/ai";
import { CREDIT_COST, type ImageGenRequest, type Network } from "@postline/core";
import { storage } from "@/lib/storage";

export const IMAGE_STYLES = ["photo", "illustration", "3d", "minimal", "brand"] as const;
export type ImageStyleOption = (typeof IMAGE_STYLES)[number];

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };

/** Brand.colors JSON → valid hex strings. */
export function brandColors(colors: unknown): string[] {
  if (!Array.isArray(colors)) return [];
  return colors.filter((c): c is string => typeof c === "string" && /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c.trim())).slice(0, 5);
}

/** A sensible default canvas for a set of networks (portrait for Instagram/TikTok/Pinterest, else square). */
export function defaultImageSize(networks: Network[]): { width: number; height: number } {
  if (networks.some((n) => n === "PINTEREST")) return { width: 1000, height: 1500 };
  if (networks.some((n) => n === "INSTAGRAM" || n === "TIKTOK" || n === "THREADS")) return { width: 1080, height: 1350 };
  return { width: 1080, height: 1080 };
}

export interface GenerateImagesParams {
  brand: { id: string; colors: unknown };
  actorId: string;
  prompt: string;
  width: number;
  height: number;
  count: number;
  style?: ImageStyleOption;
  refType?: string;
  refId?: string;
}

/**
 * Charge `count` image credits, generate, store each file and create MediaAsset rows (source "ai").
 * Credits are refunded if anything throws.
 */
export async function generateAndStoreImages(p: GenerateImagesParams): Promise<MediaAsset[]> {
  const count = Math.max(1, Math.min(10, Math.floor(p.count)));
  const colors = brandColors(p.brand.colors);
  const req: ImageGenRequest = {
    prompt: p.prompt,
    width: p.width,
    height: p.height,
    count,
    style: p.style,
    colors: p.style === "brand" && colors.length ? colors : undefined,
  };
  return withCredits(
    { brandId: p.brand.id, actorId: p.actorId, reason: "image", amount: count * CREDIT_COST.image, refType: p.refType, refId: p.refId },
    async () => {
      const generated = await images.generate(req);
      const rows: MediaAsset[] = [];
      for (const img of generated.slice(0, count)) {
        const key = `${p.brand.id}/ai-${randomUUID().replace(/-/g, "")}.${EXT[img.mime] ?? "png"}`;
        const stored = await storage().put(key, img.bytes, img.mime);
        rows.push(
          await prisma.mediaAsset.create({
            data: {
              brandId: p.brand.id,
              url: stored.url,
              key: stored.key,
              mime: img.mime,
              width: img.width,
              height: img.height,
              sizeBytes: img.bytes.byteLength,
              source: "ai",
              alt: p.prompt.slice(0, 1000),
            },
          }),
        );
      }
      return rows;
    },
  );
}

/** Append media to a group after its existing media (positions continue). */
export async function attachMediaToGroup(groupId: string, mediaIds: string[]): Promise<void> {
  if (!mediaIds.length) return;
  const last = await prisma.postMedia.findFirst({ where: { groupId }, orderBy: { position: "desc" }, select: { position: true } });
  const start = (last?.position ?? -1) + 1;
  await prisma.postMedia.createMany({
    data: mediaIds.map((mediaId, i) => ({ groupId, mediaId, position: start + i })),
    skipDuplicates: true,
  });
}

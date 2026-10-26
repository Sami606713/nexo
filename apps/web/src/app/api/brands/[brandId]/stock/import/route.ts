import { z } from "zod";
import { prisma } from "@postline/db";
import { badRequest, HttpError, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { EXT_BY_MIME, MEDIA_RULES, storage } from "@/lib/storage";
import { readImageSize } from "@/lib/posts/image-size";
import { toMediaDTO } from "@/lib/posts/dto";
import { newKey } from "@/components/studio/server";
import { STOCK_HOSTS, stockProviders } from "@/components/studio/stock";

type Ctx = { params: Promise<{ brandId: string }> };

export const runtime = "nodejs";

const input = z.object({
  provider: z.enum(["unsplash", "pexels"]),
  url: z.string().url().max(2000),
  downloadLocation: z.string().url().max(2000).optional(),
  alt: z.string().max(300).optional(),
});

/** Copy a stock photo into the brand media library (source "stock") so the canvas can export it. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const body = await parseBody(req, input);
  if (!stockProviders()[body.provider]) throw badRequest("That photo provider isn't configured");
  const u = new URL(body.url);
  if (u.protocol !== "https:" || !STOCK_HOSTS.includes(u.hostname)) throw badRequest("Unsupported photo URL");

  if (body.provider === "unsplash" && body.downloadLocation) {
    const dl = new URL(body.downloadLocation);
    if (dl.hostname === "api.unsplash.com")
      void fetch(dl, { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } }).catch(() => undefined);
  }

  const res = await fetch(u, { redirect: "error", cache: "no-store" });
  if (!res.ok) throw new HttpError(502, "Couldn't download that photo");
  const mime = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
  if (!(MEDIA_RULES.image.mimes as readonly string[]).includes(mime)) throw badRequest("Unsupported image type");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MEDIA_RULES.image.maxBytes) throw new HttpError(413, "That photo is too large");
  const dims = readImageSize(bytes.subarray(0, 512 * 1024));
  const stored = await storage().put(newKey(access.brand.id, EXT_BY_MIME[mime] ?? "jpg"), bytes, mime);
  const asset = await prisma.mediaAsset.create({
    data: {
      brandId: access.brand.id,
      url: stored.url,
      key: stored.key,
      mime,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      sizeBytes: bytes.byteLength,
      source: "stock",
      alt: body.alt?.trim() || null,
    },
  });
  return toMediaDTO(asset);
});

import { prisma } from "@postline/db";
import { badRequest, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { storage } from "@/lib/storage";
import { readImageSize } from "@/lib/posts/image-size";
import { toMediaDTO } from "@/lib/posts/dto";
import { decodeDataUrl, loadDesign, newKey } from "@/components/studio/server";

type Ctx = { params: Promise<{ brandId: string; designId: string }> };

export const runtime = "nodejs";

const MAX = 15 * 1024 * 1024;

/**
 * Export the rendered design as a media asset (source "studio").
 * Body: multipart `file` (image/png) or JSON `{ dataUrl }`. → { media, design }
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId, designId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const design = await loadDesign(access.brand.id, designId);

  let mime: string;
  let bytes: Uint8Array;
  const ct = req.headers.get("content-type") ?? "";
  if (ct.startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") throw badRequest("Attach the PNG as `file`");
    if (!["image/png", "image/jpeg"].includes(file.type)) throw badRequest("Export must be PNG or JPEG");
    if (file.size > MAX) throw badRequest("Export must be 15 MB or smaller");
    mime = file.type;
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    const body = (await req.json().catch(() => null)) as { dataUrl?: unknown } | null;
    if (!body || typeof body.dataUrl !== "string") throw badRequest("Expected { dataUrl }");
    if (body.dataUrl.length > MAX * 1.4) throw badRequest("Export must be 15 MB or smaller");
    ({ mime, bytes } = decodeDataUrl(body.dataUrl, MAX));
  }
  const dims = readImageSize(bytes.subarray(0, 512 * 1024));
  if (!dims) throw badRequest("That image looks corrupted");

  const stored = await storage().put(newKey(access.brand.id, mime === "image/png" ? "png" : "jpg"), bytes, mime);
  const media = await prisma.mediaAsset.create({
    data: {
      brandId: access.brand.id,
      url: stored.url,
      key: stored.key,
      mime,
      width: dims.width,
      height: dims.height,
      sizeBytes: bytes.byteLength,
      source: "studio",
      alt: design.name.slice(0, 1000),
    },
  });
  await prisma.design.update({ where: { id: design.id }, data: { previewUrl: stored.url } });
  return { media: toMediaDTO(media), designId: design.id };
});

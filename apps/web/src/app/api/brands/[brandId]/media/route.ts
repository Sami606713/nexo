import { randomUUID } from "node:crypto";
import { prisma } from "@postline/db";
import { badRequest, HttpError, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { EXT_BY_MIME, MEDIA_RULES, storage } from "@/lib/storage";
import { readImageSize } from "@/lib/posts/image-size";
import { toMediaDTO } from "@/lib/posts/dto";

type Ctx = { params: Promise<{ brandId: string }> };

export const runtime = "nodejs";

const MB = 1024 * 1024;

/** POST multipart/form-data with `file` (and optional `alt`). */
export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId, "posts.write");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Expected a multipart upload");
  }
  const file = form.get("file");
  if (!file || typeof file === "string") throw badRequest("Attach a file to upload");

  const mime = file.type === "video/mov" ? "video/quicktime" : file.type;
  const kind = (MEDIA_RULES.image.mimes as readonly string[]).includes(mime)
    ? "image"
    : (MEDIA_RULES.video.mimes as readonly string[]).includes(mime)
      ? "video"
      : null;
  if (!kind) throw badRequest("Unsupported file type. Use JPEG, PNG, WebP, GIF, MP4 or MOV.");
  const rule = MEDIA_RULES[kind];
  if (file.size > rule.maxBytes) {
    throw new HttpError(413, `${kind === "image" ? "Images" : "Videos"} must be ${rule.maxBytes / MB} MB or smaller`);
  }
  if (file.size === 0) throw badRequest("The file is empty");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const dims = kind === "image" ? readImageSize(bytes.subarray(0, 512 * 1024)) : null;
  if (kind === "image" && !dims) throw badRequest("That image looks corrupted or isn't the type it claims to be");

  const key = `${access.brand.id}/${randomUUID().replace(/-/g, "")}.${EXT_BY_MIME[mime] ?? "bin"}`;
  const stored = await storage().put(key, bytes, mime);

  const alt = form.get("alt");
  const asset = await prisma.mediaAsset.create({
    data: {
      brandId: access.brand.id,
      url: stored.url,
      key: stored.key,
      mime,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      sizeBytes: file.size,
      source: "upload",
      alt: typeof alt === "string" && alt.trim() ? alt.trim().slice(0, 1000) : null,
    },
  });
  return toMediaDTO(asset);
});

/** GET ?cursor=<id>&limit=1..100 → { items, nextCursor } (newest first). */
export const GET = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId);
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? 40) || 40));
  const cursor = sp.get("cursor");
  const rows = await prisma.mediaAsset.findMany({
    where: { brandId: access.brand.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items: items.map(toMediaDTO), nextCursor: hasMore ? items[items.length - 1]!.id : null };
});

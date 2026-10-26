import { z } from "zod";
import { route } from "@/lib/http";
import { readBody } from "@/lib/posts/body";
import { requireBrand } from "@/lib/session";
import { toMediaDTO } from "@/lib/posts/dto";
import { IMAGE_STYLES, generateAndStoreImages } from "@/lib/ai-images";

type Ctx = { params: Promise<{ brandId: string }> };

export const runtime = "nodejs";
export const maxDuration = 300;

const input = z.object({
  prompt: z.string().trim().min(3, "Describe the image you want").max(2000),
  width: z.number().int().min(256).max(2048).default(1080),
  height: z.number().int().min(256).max(2048).default(1080),
  count: z.number().int().min(1).max(4).default(1),
  style: z.enum(IMAGE_STYLES).optional(),
});

/** POST {prompt, width, height, count(1-4), style} → { media: MediaDTO[] }. Costs 1 credit per image. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  const access = await requireBrand(brandId, "posts.write");
  const body = await readBody(req, input);
  const rows = await generateAndStoreImages({
    brand: access.brand,
    actorId: access.user.id,
    prompt: body.prompt,
    width: body.width,
    height: body.height,
    count: body.count,
    style: body.style,
    refType: "MediaAsset",
  });
  return { media: rows.map(toMediaDTO) };
});

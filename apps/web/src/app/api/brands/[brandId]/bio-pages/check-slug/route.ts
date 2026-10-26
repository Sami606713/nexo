import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { slugAvailable, slugSchema } from "../_schema";

type Ctx = { params: Promise<{ brandId: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId);
  const sp = new URL(req.url).searchParams;
  const parsed = slugSchema.safeParse(sp.get("slug") ?? "");
  if (!parsed.success) return { slug: sp.get("slug"), available: false, reason: parsed.error.issues[0]?.message ?? "Invalid address" };
  const available = await slugAvailable(parsed.data, sp.get("excludeId") ?? undefined);
  return { slug: parsed.data, available, reason: available ? null : "That address is already taken" };
});

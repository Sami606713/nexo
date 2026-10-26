import { HttpError, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { searchStock, stockProviders } from "@/components/studio/stock";

type Ctx = { params: Promise<{ brandId: string }> };

export const runtime = "nodejs";

/**
 * GET ?provider=unsplash|pexels&q=&page= → { providers, items }.
 * Without configured keys returns { providers: {unsplash:false,pexels:false}, items: [] } so the UI can hide the panel.
 */
export const GET = route<Ctx>(async (req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId);
  const providers = stockProviders();
  const sp = new URL(req.url).searchParams;
  const want = sp.get("provider");
  const provider = want === "pexels" && providers.pexels ? "pexels" : want === "unsplash" && providers.unsplash ? "unsplash" : providers.unsplash ? "unsplash" : providers.pexels ? "pexels" : null;
  if (!provider || sp.get("probe")) return { providers, items: [] };
  const page = Math.min(50, Math.max(1, Number(sp.get("page") ?? 1) || 1));
  try {
    const items = await searchStock(provider, (sp.get("q") ?? "").trim().slice(0, 100), page);
    return { providers, provider, items };
  } catch (err) {
    console.error("[stock]", err);
    throw new HttpError(502, "The photo library is unavailable right now");
  }
});

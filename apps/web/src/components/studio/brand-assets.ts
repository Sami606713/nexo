import type { BrandAssets } from "./context";

/** Normalise Brand.colors / Brand.logos JSON into the shape Studio uses. */
export function brandAssets(brand: { colors: unknown; logos: unknown }): BrandAssets {
  const colors = Array.isArray(brand.colors)
    ? brand.colors.filter((c): c is string => typeof c === "string" && /^#[0-9a-f]{3,8}$/i.test(c.trim())).map((c) => c.trim())
    : [];
  const logos = Array.isArray(brand.logos)
    ? brand.logos
        .map((l) => (typeof l === "string" ? { url: l } : l && typeof l === "object" && typeof (l as { url?: unknown }).url === "string" ? (l as { url: string; kind?: string }) : null))
        .filter((l): l is { url: string; kind?: string } => !!l)
    : [];
  return { colors, logos };
}

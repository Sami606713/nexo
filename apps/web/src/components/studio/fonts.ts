// Curated Google Fonts for Studio. Loaded on demand via a <link> to fonts.googleapis.com.

export interface StudioFont {
  family: string;
  category: "sans" | "serif" | "display" | "script" | "mono";
  weights: number[];
  italic?: boolean;
}

export const FONTS: StudioFont[] = [
  { family: "Inter", category: "sans", weights: [300, 400, 500, 600, 700, 800, 900], italic: true },
  { family: "Poppins", category: "sans", weights: [300, 400, 500, 600, 700, 800, 900], italic: true },
  { family: "Montserrat", category: "sans", weights: [300, 400, 500, 600, 700, 800, 900], italic: true },
  { family: "Manrope", category: "sans", weights: [300, 400, 500, 600, 700, 800] },
  { family: "Space Grotesk", category: "sans", weights: [300, 400, 500, 600, 700] },
  { family: "Outfit", category: "sans", weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: "Sora", category: "sans", weights: [300, 400, 500, 600, 700, 800] },
  { family: "Work Sans", category: "sans", weights: [300, 400, 500, 600, 700, 800, 900], italic: true },
  { family: "Raleway", category: "sans", weights: [300, 400, 500, 600, 700, 800, 900], italic: true },
  { family: "Syne", category: "display", weights: [400, 500, 600, 700, 800] },
  { family: "Bebas Neue", category: "display", weights: [400] },
  { family: "Anton", category: "display", weights: [400] },
  { family: "Oswald", category: "display", weights: [300, 400, 500, 600, 700] },
  { family: "Archivo Black", category: "display", weights: [400] },
  { family: "Abril Fatface", category: "display", weights: [400] },
  { family: "Playfair Display", category: "serif", weights: [400, 500, 600, 700, 800, 900], italic: true },
  { family: "DM Serif Display", category: "serif", weights: [400], italic: true },
  { family: "Fraunces", category: "serif", weights: [300, 400, 500, 600, 700, 800, 900], italic: true },
  { family: "Lora", category: "serif", weights: [400, 500, 600, 700], italic: true },
  { family: "Libre Baskerville", category: "serif", weights: [400, 700], italic: true },
  { family: "Caveat", category: "script", weights: [400, 500, 600, 700] },
  { family: "Pacifico", category: "script", weights: [400] },
  { family: "JetBrains Mono", category: "mono", weights: [400, 500, 700], italic: true },
];

export const FONT_FAMILIES = FONTS.map((f) => f.family);

export const fontByFamily = (family: string) => FONTS.find((f) => f.family === family);

/** Snap a requested weight to the nearest one the family ships. */
export function nearestWeight(family: string, weight: number): number {
  const f = fontByFamily(family);
  if (!f) return weight;
  return f.weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), f.weights[0]!);
}

/** Google Fonts CSS2 URL for the whole curated list (one request). */
export function googleFontsHref(families: StudioFont[] = FONTS): string {
  const parts = families.map((f) => {
    const name = f.family.replace(/ /g, "+");
    if (f.italic) {
      const axes = [...f.weights.map((w) => `0,${w}`), ...f.weights.map((w) => `1,${w}`)].join(";");
      return `family=${name}:ital,wght@${axes}`;
    }
    return `family=${name}:wght@${f.weights.join(";")}`;
  });
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}

/** Font pairings shown in the Text panel. */
export const FONT_COMBOS: { name: string; heading: { family: string; weight: number }; body: { family: string; weight: number }; sample: [string, string] }[] = [
  { name: "Editorial", heading: { family: "Playfair Display", weight: 700 }, body: { family: "Inter", weight: 400 }, sample: ["The Slow Issue", "Stories worth your Sunday"] },
  { name: "Bold sale", heading: { family: "Anton", weight: 400 }, body: { family: "Montserrat", weight: 600 }, sample: ["FLASH SALE", "Up to 50% off — 48 hours only"] },
  { name: "Modern tech", heading: { family: "Space Grotesk", weight: 700 }, body: { family: "Inter", weight: 400 }, sample: ["Ship faster.", "Your release notes, simplified"] },
  { name: "Warm & human", heading: { family: "Fraunces", weight: 600 }, body: { family: "Work Sans", weight: 400 }, sample: ["Made by hand", "Small batches, big flavour"] },
  { name: "Poster", heading: { family: "Bebas Neue", weight: 400 }, body: { family: "Oswald", weight: 400 }, sample: ["LIVE TONIGHT", "Doors open at 8 PM"] },
  { name: "Friendly", heading: { family: "Poppins", weight: 800 }, body: { family: "Poppins", weight: 400 }, sample: ["Hello, weekend!", "Plans? We've got ideas"] },
  { name: "Signature", heading: { family: "Caveat", weight: 700 }, body: { family: "Manrope", weight: 500 }, sample: ["with love,", "the studio team"] },
  { name: "Luxe", heading: { family: "DM Serif Display", weight: 400 }, body: { family: "Raleway", weight: 500 }, sample: ["Noir Collection", "Available in limited numbers"] },
];

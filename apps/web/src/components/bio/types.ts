/** Bio page document shapes (stored in BioPage.theme / BioPage.blocks JSON). Browser + server safe. */

export type BioBlockType = "link" | "header" | "social" | "image" | "embed" | "text";

export interface SocialLink {
  network: string; // instagram | x | facebook | tiktok | youtube | linkedin | bluesky | mastodon | threads | pinterest | website | email
  url: string;
}

export interface BioBlock {
  id: string;
  type: BioBlockType;
  /** link: button label; header: heading text; image: alt/caption; embed: title. */
  label?: string;
  /** link target, image click-through, YouTube URL for embed. */
  url?: string;
  /** text block body. */
  text?: string;
  /** image block source. */
  imageUrl?: string;
  /** social block icons. */
  links?: SocialLink[];
  /** Hidden blocks stay in the editor but aren't rendered publicly. */
  hidden?: boolean;
}

export type ButtonStyle = "filled" | "outline" | "soft" | "pill";
export type BioFont = "inter" | "serif" | "mono" | "rounded" | "grotesk";

export interface BioTheme {
  background: { type: "solid" | "gradient"; value: string };
  buttonStyle: ButtonStyle;
  font: BioFont;
  accent: string;
  /** Text color on the background; derived when omitted. */
  textColor?: string;
}

export const DEFAULT_THEME: BioTheme = {
  background: { type: "gradient", value: "linear-gradient(160deg, #F3E7D9 0%, #E9CFB2 100%)" },
  buttonStyle: "filled",
  font: "inter",
  accent: "#3B2416",
};

export const BACKGROUND_PRESETS: { name: string; type: "solid" | "gradient"; value: string; dark: boolean }[] = [
  { name: "Paper", type: "solid", value: "#FAF8F5", dark: false },
  { name: "Ink", type: "solid", value: "#14141B", dark: true },
  { name: "Sage", type: "solid", value: "#DDE7DA", dark: false },
  { name: "Latte", type: "gradient", value: "linear-gradient(160deg, #F3E7D9 0%, #E9CFB2 100%)", dark: false },
  { name: "Espresso", type: "gradient", value: "linear-gradient(160deg, #3B2416 0%, #6B3E23 100%)", dark: true },
  { name: "Dusk", type: "gradient", value: "linear-gradient(160deg, #4338CA 0%, #A855F7 100%)", dark: true },
  { name: "Lagoon", type: "gradient", value: "linear-gradient(160deg, #0EA5E9 0%, #14B8A6 100%)", dark: true },
  { name: "Peach", type: "gradient", value: "linear-gradient(160deg, #FDE68A 0%, #FCA5A5 100%)", dark: false },
  { name: "Midnight", type: "gradient", value: "linear-gradient(160deg, #0F172A 0%, #1E293B 60%, #334155 100%)", dark: true },
];

export const FONTS: Record<BioFont, { label: string; css: string; google?: string }> = {
  inter: { label: "Inter", css: "'Inter', system-ui, sans-serif", google: "Inter:wght@400;600;700" },
  grotesk: { label: "Space Grotesk", css: "'Space Grotesk', system-ui, sans-serif", google: "Space+Grotesk:wght@400;600;700" },
  serif: { label: "Fraunces", css: "'Fraunces', Georgia, serif", google: "Fraunces:wght@400;600;700" },
  rounded: { label: "Nunito", css: "'Nunito', system-ui, sans-serif", google: "Nunito:wght@400;700;800" },
  mono: { label: "JetBrains Mono", css: "'JetBrains Mono', ui-monospace, monospace", google: "JetBrains+Mono:wght@400;600" },
};

export const SOCIAL_NETWORKS: { value: string; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "x", label: "X" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "bluesky", label: "Bluesky" },
  { value: "mastodon", label: "Mastodon" },
  { value: "threads", label: "Threads" },
  { value: "pinterest", label: "Pinterest" },
  { value: "website", label: "Website" },
  { value: "email", label: "Email" },
];

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export const RESERVED_SLUGS = new Set(["app", "api", "admin", "login", "signup", "new", "edit", "settings", "help", "go"]);

/** Perceived luminance of a hex or the first hex color inside a gradient → whether text should be light. */
export function isDarkBackground(bg: BioTheme["background"]): boolean {
  const preset = BACKGROUND_PRESETS.find((p) => p.value === bg.value);
  if (preset) return preset.dark;
  const hexes = bg.value.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi) ?? [];
  if (!hexes.length) return false;
  const lum = hexes.map((h) => {
    let s = h.slice(1);
    if (s.length === 3) s = s.split("").map((c) => c + c).join("");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  });
  return lum.reduce((a, b) => a + b, 0) / lum.length < 0.5;
}

export function normalizeTheme(raw: unknown): BioTheme {
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<BioTheme>;
  return {
    background:
      t.background && typeof t.background === "object" && typeof t.background.value === "string"
        ? { type: t.background.type === "gradient" ? "gradient" : "solid", value: t.background.value }
        : DEFAULT_THEME.background,
    buttonStyle: (["filled", "outline", "soft", "pill"] as const).includes(t.buttonStyle as ButtonStyle) ? (t.buttonStyle as ButtonStyle) : "filled",
    font: t.font && t.font in FONTS ? t.font : "inter",
    accent: typeof t.accent === "string" && /^#[0-9a-f]{3,8}$/i.test(t.accent) ? t.accent : DEFAULT_THEME.accent,
    textColor: typeof t.textColor === "string" ? t.textColor : undefined,
  };
}

export function normalizeBlocks(raw: unknown): BioBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b): b is BioBlock => !!b && typeof b === "object" && typeof (b as BioBlock).id === "string" && typeof (b as BioBlock).type === "string")
    .map((b) => ({ ...b, links: Array.isArray(b.links) ? b.links : undefined }));
}

/** YouTube URL → embed id. */
export function youtubeId(url: string | undefined): string | null {
  if (!url) return null;
  const m =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(url) ?? null;
  return m?.[1] ?? null;
}

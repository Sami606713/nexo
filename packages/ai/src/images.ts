// OWNED BY: campaigns/images agent. ImageService: OpenAI gpt-image-1 → Replicate flux-schnell → local generated artwork.
// Providers are called with plain fetch (no SDKs). The local generator renders deterministic abstract SVG artwork
// (seeded by the prompt) and rasterizes it to JPEG with `sharp` when that module is available at runtime.
import type { GeneratedImage, ImageGenRequest, ImageService } from "@postline/core";

export type ImageStyle = NonNullable<ImageGenRequest["style"]>;
export const IMAGE_STYLES: readonly ImageStyle[] = ["photo", "illustration", "3d", "minimal", "brand"];

const MIN_DIM = 64;
const MAX_DIM = 4096;
const MAX_COUNT = 10;

export function clampDim(n: number): number {
  if (!Number.isFinite(n)) return 1024;
  return Math.min(MAX_DIM, Math.max(MIN_DIM, Math.round(n)));
}

function clampCount(n: number | undefined): number {
  if (n == null || !Number.isFinite(n)) return 1;
  return Math.min(MAX_COUNT, Math.max(1, Math.floor(n)));
}

// ───────────────────────────────────────────── deterministic randomness

/** FNV-1a 32-bit hash. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  /** mulberry32 */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length] as T;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  shuffle<T>(arr: readonly T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
}

// ───────────────────────────────────────────── colour helpers

type Rgb = [number, number, number];

export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  let h = (m[1] as string).toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h}`;
}

function hexToRgb(hex: string): Rgb {
  const h = (normalizeHex(hex) ?? "#888888").slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex([r, g, b]: Rgb): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

const lighten = (c: string, t: number) => mix(c, "#ffffff", t);
const darken = (c: string, t: number) => mix(c, "#0b0b12", t);

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rotateHue(hex: string, deg: number): string {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as Rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  h = (h + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]);
}

// ───────────────────────────────────────────── palettes

export interface Palette {
  name: string;
  /** Background gradient (start, end). */
  bg: [string, string];
  /** Five accent colours, most important first. */
  colors: string[];
  /** Text colour that reads on the background. */
  ink: string;
}

interface CuratedPalette extends Palette {
  keywords: string[];
}

const PALETTES: CuratedPalette[] = [
  {
    name: "electric",
    keywords: ["tech", "ai", "software", "saas", "data", "cloud", "app", "digital", "code", "developer", "automation", "startup", "product", "platform", "cyber", "robot", "future"],
    bg: ["#0b1026", "#1b1350"],
    colors: ["#6c5cff", "#22d3ee", "#a855f7", "#3b82f6", "#f0abfc"],
    ink: "#f5f3ff",
  },
  {
    name: "ocean",
    keywords: ["ocean", "sea", "beach", "water", "travel", "summer", "surf", "island", "blue", "swim", "coast", "sail", "holiday", "vacation"],
    bg: ["#03263b", "#0b5d7a"],
    colors: ["#2ec4b6", "#7dd3fc", "#0ea5e9", "#fde68a", "#e0f2fe"],
    ink: "#f0f9ff",
  },
  {
    name: "terracotta",
    keywords: ["food", "coffee", "bakery", "restaurant", "cafe", "recipe", "kitchen", "autumn", "fall", "warm", "craft", "handmade", "home", "cozy", "wine", "chocolate", "bread"],
    bg: ["#3b1d14", "#7a3b22"],
    colors: ["#e07a5f", "#f2cc8f", "#d4a373", "#81b29a", "#f4f1de"],
    ink: "#fdf6ec",
  },
  {
    name: "forest",
    keywords: ["nature", "green", "eco", "garden", "plant", "sustainable", "sustainability", "organic", "earth", "climate", "outdoor", "hiking", "farm", "forest", "environment", "recycle"],
    bg: ["#0f2a1d", "#1f4d36"],
    colors: ["#52b788", "#b7e4c7", "#d8f3dc", "#f4a261", "#95d5b2"],
    ink: "#f1faee",
  },
  {
    name: "sunset",
    keywords: ["launch", "sale", "offer", "discount", "deal", "promo", "energy", "bold", "black friday", "new", "announce", "exclusive", "limited", "drop", "release", "fitness", "sport"],
    bg: ["#2a0a3d", "#7b1e5a"],
    colors: ["#ff6b6b", "#ffa94d", "#f72585", "#ffd166", "#b5179e"],
    ink: "#fff5f7",
  },
  {
    name: "noir-gold",
    keywords: ["luxury", "premium", "fashion", "jewelry", "jewellery", "elegant", "gold", "beauty", "watch", "hotel", "exclusive", "boutique", "perfume", "design"],
    bg: ["#0d0d0f", "#24211c"],
    colors: ["#d4af37", "#f3e5ab", "#b08d57", "#8a7a5c", "#fffaf0"],
    ink: "#fbf6e9",
  },
  {
    name: "pastel-calm",
    keywords: ["health", "wellness", "spa", "yoga", "calm", "mindful", "meditation", "care", "skin", "sleep", "baby", "family", "self-care", "therapy", "clinic", "dental"],
    bg: ["#f6f1ff", "#e3f4f1"],
    colors: ["#b8a1ff", "#7fd1c7", "#ffb5c2", "#ffd6a5", "#9ad0ec"],
    ink: "#2d2a40",
  },
  {
    name: "corporate",
    keywords: ["finance", "business", "invest", "investor", "bank", "consult", "b2b", "enterprise", "leadership", "strategy", "growth", "report", "insurance", "legal", "accounting", "real estate", "property"],
    bg: ["#0a1f33", "#123b5c"],
    colors: ["#2bb3a3", "#f2b84b", "#4f8fdd", "#a5d8ff", "#e9f1f7"],
    ink: "#f3f8fc",
  },
  {
    name: "neon-night",
    keywords: ["event", "party", "music", "festival", "concert", "night", "club", "gaming", "game", "esports", "stream", "dj", "show", "conference", "webinar", "meetup"],
    bg: ["#09061a", "#1d0b3a"],
    colors: ["#ff2bd6", "#00e5ff", "#7c4dff", "#faff00", "#ff7849"],
    ink: "#fdfcff",
  },
  {
    name: "citrus",
    keywords: ["kids", "school", "education", "learn", "course", "tips", "fun", "spring", "fresh", "juice", "fruit", "smoothie", "community", "local", "pet", "dog", "cat"],
    bg: ["#fff8e7", "#ffe9c7"],
    colors: ["#ff8a00", "#2ec4b6", "#ffcf33", "#ef476f", "#118ab2"],
    ink: "#2b2118",
  },
];

/** Palette from brand colours: the given colours first, then tints/shades/hue neighbours to fill five slots. */
export function brandPalette(colors: string[]): Palette {
  const base = colors.map(normalizeHex).filter((c): c is string => !!c).slice(0, 5);
  if (!base.length) return PALETTES[0] as Palette;
  const primary = base[0] as string;
  const fill = [lighten(primary, 0.45), rotateHue(primary, 35), darken(primary, 0.25), rotateHue(primary, -40), lighten(base[1] ?? primary, 0.7)];
  const out = [...base];
  for (const c of fill) if (out.length < 5) out.push(c);
  const light = luminance(primary) > 0.55;
  const bg: [string, string] = light ? [lighten(primary, 0.85), lighten(base[1] ?? primary, 0.7)] : [darken(primary, 0.72), darken(base[1] ?? primary, 0.5)];
  return { name: "brand", bg, colors: out, ink: light ? "#1d1b26" : "#fbfaff" };
}

export function choosePalette(req: Pick<ImageGenRequest, "prompt" | "colors">): Palette {
  if (req.colors?.some((c) => normalizeHex(c))) return brandPalette(req.colors);
  const text = ` ${req.prompt.toLowerCase().replace(/[^a-z0-9\s-]/g, " ")} `;
  let best: CuratedPalette | null = null;
  let bestScore = 0;
  for (const p of PALETTES) {
    let score = 0;
    for (const k of p.keywords) if (text.includes(` ${k} `) || text.includes(` ${k}s `)) score += k.includes(" ") ? 2 : 1;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best ?? (PALETTES[hashString(req.prompt) % PALETTES.length] as CuratedPalette);
}

// ───────────────────────────────────────────── SVG building blocks

const f = (n: number) => (Math.round(n * 10) / 10).toString();

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] as string);
}

interface Ctx {
  w: number;
  h: number;
  m: number; // min(w,h)
  rng: Rng;
  p: Palette;
  defs: string[];
  title?: string;
}

function linearBg(ctx: Ctx, id: string, a: string, b: string, angleDeg?: number): string {
  const ang = ((angleDeg ?? ctx.rng.range(20, 160)) * Math.PI) / 180;
  const x = Math.cos(ang) / 2;
  const y = Math.sin(ang) / 2;
  ctx.defs.push(
    `<linearGradient id="${id}" x1="${f(0.5 - x)}" y1="${f(0.5 - y)}" x2="${f(0.5 + x)}" y2="${f(0.5 + y)}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`,
  );
  return `<rect width="${ctx.w}" height="${ctx.h}" fill="url(#${id})"/>`;
}

function grainAndVignette(ctx: Ctx, strength = 0.09): string {
  ctx.defs.push(
    `<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${f(Math.max(0.6, 900 / ctx.m) * 0.9)}" numOctaves="2" seed="${ctx.rng.int(1, 999)}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>`,
    `<radialGradient id="vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.32"/></radialGradient>`,
  );
  return `<rect width="${ctx.w}" height="${ctx.h}" fill="url(#vig)"/><rect width="${ctx.w}" height="${ctx.h}" filter="url(#grain)" opacity="${strength}"/>`;
}

/** Smooth closed blob through jittered radial points (Catmull-Rom → cubic Bézier). */
function blobPath(cx: number, cy: number, r: number, rng: Rng, points = 7, jitter = 0.28): string {
  const pts: [number, number][] = [];
  const rot = rng.range(0, Math.PI * 2);
  for (let i = 0; i < points; i++) {
    const a = rot + (i / points) * Math.PI * 2;
    const rr = r * (1 + rng.range(-jitter, jitter));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  const at = (i: number) => pts[(i + points) % points] as [number, number];
  let d = `M${f(at(0)[0])},${f(at(0)[1])}`;
  for (let i = 0; i < points; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0] as number)},${f(c1[1] as number)} ${f(c2[0] as number)},${f(c2[1] as number)} ${f(p2[0])},${f(p2[1])}`;
  }
  return `${d} Z`;
}

// ───────────────────────────────────────────── compositions

type Composition = (ctx: Ctx) => string;

/** Soft aurora / mesh gradient: big blurred colour fields over a gradient. */
const aurora: Composition = (ctx) => {
  const { w, h, m, rng, p } = ctx;
  const parts = [linearBg(ctx, "bg", p.bg[0], p.bg[1])];
  ctx.defs.push(`<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(m * 0.085)}"/></filter>`);
  const fields: string[] = [];
  const n = rng.int(5, 7);
  const colors = rng.shuffle(p.colors);
  for (let i = 0; i < n; i++) {
    const c = colors[i % colors.length] as string;
    fields.push(
      `<ellipse cx="${f(rng.range(-0.1, 1.1) * w)}" cy="${f(rng.range(-0.1, 1.1) * h)}" rx="${f(rng.range(0.22, 0.5) * m)}" ry="${f(rng.range(0.18, 0.42) * m)}" fill="${c}" opacity="${f(rng.range(0.55, 0.9))}"/>`,
    );
  }
  parts.push(`<g filter="url(#soft)">${fields.join("")}</g>`);
  // a light sweep and a few crisp orbit lines for depth
  ctx.defs.push(`<linearGradient id="sweep" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/></linearGradient>`);
  parts.push(`<rect width="${w}" height="${h}" fill="url(#sweep)"/>`);
  const ocx = rng.range(0.25, 0.75) * w;
  const ocy = rng.range(0.25, 0.75) * h;
  for (let i = 0; i < 3; i++) {
    parts.push(
      `<circle cx="${f(ocx)}" cy="${f(ocy)}" r="${f(m * (0.22 + i * 0.13))}" fill="none" stroke="#ffffff" stroke-opacity="${f(0.16 - i * 0.04)}" stroke-width="${f(Math.max(1, m * 0.002))}"/>`,
    );
  }
  parts.push(grainAndVignette(ctx, 0.1));
  return parts.join("");
};

/** Layered sine-wave landscape with a glowing sun. */
const waves: Composition = (ctx) => {
  const { w, h, m, rng, p } = ctx;
  const parts = [linearBg(ctx, "bg", p.bg[0], p.bg[1], 90)];
  const sun = rng.pick(p.colors.slice(1, 4));
  ctx.defs.push(
    `<radialGradient id="sun"><stop offset="0" stop-color="${lighten(sun, 0.35)}"/><stop offset="0.6" stop-color="${sun}"/><stop offset="1" stop-color="${sun}" stop-opacity="0"/></radialGradient>`,
  );
  const sr = m * rng.range(0.16, 0.26);
  parts.push(`<circle cx="${f(rng.range(0.2, 0.8) * w)}" cy="${f(rng.range(0.22, 0.4) * h)}" r="${f(sr * 1.6)}" fill="url(#sun)"/>`);
  const layers = rng.int(4, 6);
  const colors = rng.shuffle(p.colors);
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const base = h * (0.45 + t * 0.42);
    const a1 = h * rng.range(0.02, 0.06);
    const a2 = h * rng.range(0.01, 0.03);
    const f1 = ((Math.PI * 2) / w) * rng.range(0.6, 1.6);
    const f2 = ((Math.PI * 2) / w) * rng.range(2, 4);
    const ph1 = rng.range(0, Math.PI * 2);
    const ph2 = rng.range(0, Math.PI * 2);
    const step = Math.max(4, w / 64);
    let d = `M0,${h} L0,${f(base + a1 * Math.sin(ph1) + a2 * Math.sin(ph2))}`;
    for (let x = step; x <= w + step; x += step) {
      const xx = Math.min(x, w);
      d += ` L${f(xx)},${f(base + a1 * Math.sin(f1 * xx + ph1) + a2 * Math.sin(f2 * xx + ph2))}`;
    }
    d += ` L${w},${h} Z`;
    const c = colors[i % colors.length] as string;
    const top = mix(c, p.bg[1], 0.35 * (1 - t));
    const bottom = darken(c, 0.25 + 0.25 * t);
    ctx.defs.push(`<linearGradient id="wv${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`);
    parts.push(`<path d="${d}" fill="url(#wv${i})" opacity="${f(0.7 + t * 0.3)}"/>`);
  }
  // tiny stars / particles in the sky
  for (let i = 0; i < 18; i++) {
    parts.push(`<circle cx="${f(rng.next() * w)}" cy="${f(rng.next() * h * 0.42)}" r="${f(m * rng.range(0.0015, 0.004))}" fill="#fff" opacity="${f(rng.range(0.25, 0.7))}"/>`);
  }
  parts.push(grainAndVignette(ctx, 0.08));
  return parts.join("");
};

/** Bauhaus-style tile grid: quarter circles, half discs, triangles, stripes. */
const geometric: Composition = (ctx) => {
  const { w, h, rng, p } = ctx;
  const cols = w >= h ? rng.int(4, 6) : rng.int(3, 4);
  const cell = w / cols;
  const rows = Math.ceil(h / cell);
  const pal = [...p.colors, p.bg[0], lighten(p.bg[1], 0.1)];
  const parts: string[] = [`<rect width="${w}" height="${h}" fill="${p.bg[0]}"/>`];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cell;
      const y = r * cell;
      const bg = rng.pick(pal);
      let fg = rng.pick(pal);
      for (let k = 0; k < 4 && fg === bg; k++) fg = rng.pick(pal);
      parts.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(cell + 0.5)}" height="${f(cell + 0.5)}" fill="${bg}"/>`);
      const s = cell;
      const kind = rng.int(0, 6);
      const corner = rng.int(0, 3);
      const cx = x + (corner === 1 || corner === 2 ? s : 0);
      const cy = y + (corner >= 2 ? s : 0);
      switch (kind) {
        case 0: {
          // quarter circle from a corner
          const sx = corner === 1 || corner === 2 ? -1 : 1;
          const sy = corner >= 2 ? -1 : 1;
          parts.push(`<path d="M${f(cx)},${f(cy)} L${f(cx + sx * s)},${f(cy)} A${f(s)},${f(s)} 0 0 ${sx * sy > 0 ? 1 : 0} ${f(cx)},${f(cy + sy * s)} Z" fill="${fg}"/>`);
          break;
        }
        case 1:
          parts.push(`<circle cx="${f(x + s / 2)}" cy="${f(y + s / 2)}" r="${f(s * 0.36)}" fill="${fg}"/>`);
          break;
        case 2: {
          // half disc on one side
          const vertical = rng.chance(0.5);
          parts.push(
            vertical
              ? `<path d="M${f(x)},${f(y + s / 2)} A${f(s / 2)},${f(s / 2)} 0 0 1 ${f(x + s)},${f(y + s / 2)} Z" fill="${fg}"/>`
              : `<path d="M${f(x + s / 2)},${f(y)} A${f(s / 2)},${f(s / 2)} 0 0 1 ${f(x + s / 2)},${f(y + s)} Z" fill="${fg}"/>`,
          );
          break;
        }
        case 3:
          parts.push(`<path d="M${f(x)},${f(y + s)} L${f(x + s)},${f(y + s)} L${f(corner % 2 ? x : x + s)},${f(y)} Z" fill="${fg}"/>`);
          break;
        case 4: {
          // concentric rings
          for (let i = 3; i >= 1; i--) {
            parts.push(`<circle cx="${f(x + s / 2)}" cy="${f(y + s / 2)}" r="${f((s * 0.42 * i) / 3)}" fill="${i % 2 ? fg : bg}"/>`);
          }
          break;
        }
        case 5: {
          // stripes
          const n = 5;
          for (let i = 0; i < n; i += 2) parts.push(`<rect x="${f(x)}" y="${f(y + (i * s) / n)}" width="${f(s)}" height="${f(s / n)}" fill="${fg}"/>`);
          break;
        }
        default:
          // small dot grid
          for (let i = 1; i <= 3; i++)
            for (let j = 1; j <= 3; j++) parts.push(`<circle cx="${f(x + (i * s) / 4)}" cy="${f(y + (j * s) / 4)}" r="${f(s * 0.06)}" fill="${fg}"/>`);
      }
    }
  }
  parts.push(grainAndVignette(ctx, 0.07));
  return parts.join("");
};

/** Organic overlapping blobs with gradient fills, a dot pattern and outline accents. */
const blobs: Composition = (ctx) => {
  const { w, h, m, rng, p } = ctx;
  const parts = [linearBg(ctx, "bg", p.bg[0], p.bg[1])];
  ctx.defs.push(`<filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${f(m * 0.03)}"/></filter>`);
  const n = rng.int(3, 5);
  const colors = rng.shuffle(p.colors);
  for (let i = 0; i < n; i++) {
    const a = colors[i % colors.length] as string;
    const b = colors[(i + 1) % colors.length] as string;
    ctx.defs.push(`<linearGradient id="bl${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lighten(a, 0.1)}"/><stop offset="1" stop-color="${b}"/></linearGradient>`);
    const cx = rng.range(0.1, 0.9) * w;
    const cy = rng.range(0.1, 0.9) * h;
    const r = m * rng.range(0.18, 0.36);
    const d = blobPath(cx, cy, r, rng, rng.int(6, 9));
    parts.push(`<path d="${d}" fill="#000" opacity="0.18" transform="translate(${f(m * 0.012)},${f(m * 0.02)})" filter="url(#shadow)"/>`);
    parts.push(`<path d="${d}" fill="url(#bl${i})" opacity="${f(rng.range(0.82, 0.96))}"/>`);
  }
  // dot pattern patch
  const dot = m * 0.035;
  ctx.defs.push(`<pattern id="dots" width="${f(dot)}" height="${f(dot)}" patternUnits="userSpaceOnUse"><circle cx="${f(dot / 2)}" cy="${f(dot / 2)}" r="${f(dot * 0.14)}" fill="${p.ink}"/></pattern>`);
  parts.push(`<rect x="${f(rng.range(0, 0.6) * w)}" y="${f(rng.range(0, 0.6) * h)}" width="${f(m * 0.32)}" height="${f(m * 0.22)}" fill="url(#dots)" opacity="0.35"/>`);
  for (let i = 0; i < 3; i++) {
    const r = m * rng.range(0.03, 0.08);
    parts.push(
      `<circle cx="${f(rng.next() * w)}" cy="${f(rng.next() * h)}" r="${f(r)}" fill="none" stroke="${rng.pick(p.colors)}" stroke-width="${f(m * 0.008)}" opacity="0.9"/>`,
    );
  }
  parts.push(grainAndVignette(ctx, 0.08));
  return parts.join("");
};

/** Glossy 3D-looking spheres and a ring floating over a soft floor. */
const spheres: Composition = (ctx) => {
  const { w, h, m, rng, p } = ctx;
  ctx.defs.push(
    `<radialGradient id="bg" cx="0.5" cy="0.35" r="0.85"><stop offset="0" stop-color="${lighten(p.bg[1], 0.12)}"/><stop offset="1" stop-color="${p.bg[0]}"/></radialGradient>`,
    `<filter id="blurS" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(m * 0.025)}"/></filter>`,
  );
  const parts = [`<rect width="${w}" height="${h}" fill="url(#bg)"/>`];
  const floor = h * rng.range(0.74, 0.84);
  const n = rng.int(3, 6);
  const balls: { x: number; r: number; c: string; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const r = m * rng.range(0.06, 0.2);
    const float = rng.chance(0.4) ? rng.range(0.05, 0.25) * h : 0;
    balls.push({ x: rng.range(0.12, 0.88) * w, r, c: p.colors[i % p.colors.length] as string, y: floor - r - float });
  }
  balls.sort((a, b) => a.r - b.r);
  // ring
  const rc = rng.pick(p.colors);
  ctx.defs.push(`<linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lighten(rc, 0.4)}"/><stop offset="1" stop-color="${darken(rc, 0.3)}"/></linearGradient>`);
  parts.push(
    `<ellipse cx="${f(rng.range(0.3, 0.7) * w)}" cy="${f(h * rng.range(0.3, 0.45))}" rx="${f(m * 0.3)}" ry="${f(m * 0.1)}" fill="none" stroke="url(#ring)" stroke-width="${f(m * 0.035)}" transform="rotate(${f(rng.range(-25, 25))} ${f(w / 2)} ${f(h / 2)})" opacity="0.9"/>`,
  );
  balls.forEach((b, i) => {
    ctx.defs.push(
      `<radialGradient id="sp${i}" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="${lighten(b.c, 0.65)}"/><stop offset="0.35" stop-color="${b.c}"/><stop offset="1" stop-color="${darken(b.c, 0.55)}"/></radialGradient>`,
    );
    const lift = floor - (b.y + b.r);
    const shadowScale = Math.max(0.35, 1 - lift / h);
    parts.push(
      `<ellipse cx="${f(b.x)}" cy="${f(floor)}" rx="${f(b.r * 0.95 * shadowScale)}" ry="${f(b.r * 0.18 * shadowScale)}" fill="#000" opacity="${f(0.45 * shadowScale)}" filter="url(#blurS)"/>`,
      `<circle cx="${f(b.x)}" cy="${f(b.y)}" r="${f(b.r)}" fill="url(#sp${i})"/>`,
      `<ellipse cx="${f(b.x - b.r * 0.35)}" cy="${f(b.y - b.r * 0.42)}" rx="${f(b.r * 0.22)}" ry="${f(b.r * 0.12)}" fill="#fff" opacity="0.45" transform="rotate(-30 ${f(b.x - b.r * 0.35)} ${f(b.y - b.r * 0.42)})"/>`,
    );
  });
  parts.push(grainAndVignette(ctx, 0.06));
  return parts.join("");
};

/** Minimal poster: generous negative space, one bold shape, an accent rule and a short title. */
const minimal: Composition = (ctx) => {
  const { w, h, m, rng, p } = ctx;
  const light = luminance(p.bg[0]) > 0.5;
  const paper = light ? p.bg[0] : rng.chance(0.5) ? "#f7f4ee" : p.bg[0];
  const ink = luminance(paper) > 0.5 ? "#1c1b22" : p.ink;
  const accent = p.colors[0] as string;
  const second = p.colors[1] as string;
  const parts = [`<rect width="${w}" height="${h}" fill="${paper}"/>`];
  const variant = rng.int(0, 2);
  const r = m * rng.range(0.24, 0.32);
  const cx = w * rng.range(0.55, 0.72);
  const cy = h * rng.range(0.3, 0.42);
  if (variant === 0) {
    parts.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${accent}"/>`);
    parts.push(`<circle cx="${f(cx - r * 0.55)}" cy="${f(cy + r * 0.45)}" r="${f(r * 0.45)}" fill="${second}" opacity="0.92"/>`);
  } else if (variant === 1) {
    // arch
    const aw = r * 1.4;
    const top = cy - r;
    parts.push(`<path d="M${f(cx - aw / 2)},${f(cy + r)} L${f(cx - aw / 2)},${f(top + aw / 2)} A${f(aw / 2)},${f(aw / 2)} 0 0 1 ${f(cx + aw / 2)},${f(top + aw / 2)} L${f(cx + aw / 2)},${f(cy + r)} Z" fill="${accent}"/>`);
    parts.push(`<circle cx="${f(cx + aw * 0.45)}" cy="${f(top + aw * 0.15)}" r="${f(r * 0.22)}" fill="${second}"/>`);
  } else {
    // stacked bars
    for (let i = 0; i < 4; i++) {
      const bw = r * (1.8 - i * 0.3);
      parts.push(`<rect x="${f(cx - bw / 2)}" y="${f(cy - r + i * r * 0.5)}" width="${f(bw)}" height="${f(r * 0.32)}" rx="${f(r * 0.16)}" fill="${i % 2 ? second : accent}"/>`);
    }
  }
  const pad = m * 0.08;
  parts.push(`<rect x="${f(pad)}" y="${f(h - pad - m * 0.2)}" width="${f(m * 0.08)}" height="${f(Math.max(2, m * 0.008))}" fill="${accent}"/>`);
  if (ctx.title) {
    const size = Math.max(14, Math.min(m * 0.1, (w - pad * 2) / (ctx.title.length * 0.58)));
    parts.push(
      `<text x="${f(pad)}" y="${f(h - pad - m * 0.06)}" font-family="Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="${f(size)}" font-weight="700" letter-spacing="${f(-size * 0.02)}" fill="${ink}">${escapeXml(ctx.title)}</text>`,
    );
  }
  parts.push(`<rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.05"/>`);
  ctx.defs.push(
    `<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${rng.int(1, 999)}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>`,
  );
  return parts.join("");
};

const COMPOSITIONS: Record<string, Composition> = { aurora, waves, geometric, blobs, spheres, minimal };

const STYLE_COMPOSITIONS: Record<ImageStyle | "default", string[]> = {
  photo: ["aurora", "waves"],
  illustration: ["blobs", "geometric", "waves"],
  "3d": ["spheres"],
  minimal: ["minimal"],
  brand: ["aurora", "blobs", "geometric", "waves", "spheres"],
  default: ["aurora", "waves", "blobs", "geometric", "spheres"],
};

const LEAD_INS =
  /^(please\s+)?((create|write|generate|make|design|draw|render|show|give me|i want|i need)\s+)?(an?\s+|the\s+|some\s+)?((image|images|picture|photo|visual|graphic|illustration|poster|post|banner|artwork)s?\s+)?((of|for|about|showing|with|that shows)\s+)?/i;

/** Short (≤ 5 words, ≤ 32 chars) title derived from the prompt, for the minimal style. */
export function shortTitle(prompt: string): string {
  const firstSentence = prompt.split(/[.!?\n]/)[0] ?? "";
  const cleaned = firstSentence.replace(LEAD_INS, "").replace(/^(an?|the|some)\s+/i, "").replace(/[^\p{L}\p{N}\s&'’-]/gu, " ").replace(/\s+/g, " ").trim();
  const small = new Set(["a", "an", "the", "of", "for", "and", "to", "in", "on", "with", "our", "at", "by"]);
  const words = cleaned.split(" ").filter(Boolean).slice(0, 5);
  while (words.length && small.has((words[words.length - 1] as string).toLowerCase())) words.pop();
  let title = words
    .map((wd, i) => (i > 0 && small.has(wd.toLowerCase()) ? wd.toLowerCase() : wd.charAt(0).toUpperCase() + wd.slice(1)))
    .join(" ");
  while (title.length > 32 && title.includes(" ")) title = title.slice(0, title.lastIndexOf(" "));
  return title.slice(0, 32);
}

/**
 * Render one deterministic SVG artwork at exactly `width`×`height`. `variant` (0-based) makes
 * multiple images from the same prompt differ while staying reproducible.
 */
export function renderLocalArtwork(req: ImageGenRequest, variant = 0): string {
  const w = clampDim(req.width);
  const h = clampDim(req.height);
  const style = req.style;
  const seed = hashString(`${req.prompt.trim().toLowerCase()}|${style ?? ""}|${(req.colors ?? []).join(",")}|${variant}`);
  const rng = new Rng(seed);
  const palette = choosePalette(req);
  const list = STYLE_COMPOSITIONS[style ?? "default"] ?? STYLE_COMPOSITIONS.default;
  const baseIdx = hashString(req.prompt) % list.length;
  const name = list[(baseIdx + variant) % list.length] as string;
  const ctx: Ctx = { w, h, m: Math.min(w, h), rng, p: palette, defs: [] };
  if (style === "minimal") {
    const t = shortTitle(req.prompt);
    if (t) ctx.title = t;
  }
  const body = (COMPOSITIONS[name] as Composition)(ctx);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${ctx.defs.join("")}</defs>${body}</svg>`;
}

// ───────────────────────────────────────────── optional sharp (rasterize / exact sizing)

type SharpFactory = (input: Uint8Array | Buffer) => {
  resize(w: number, h: number, opts?: Record<string, unknown>): ReturnType<SharpFactory>;
  png(opts?: Record<string, unknown>): ReturnType<SharpFactory>;
  jpeg(opts?: Record<string, unknown>): ReturnType<SharpFactory>;
  toBuffer(): Promise<Buffer>;
};

let sharpPromise: Promise<SharpFactory | null> | null = null;
/** `sharp` is not a declared dependency — use it when the host has it (Next.js ships it), else return null. */
async function loadSharp(): Promise<SharpFactory | null> {
  sharpPromise ??= (async () => {
    try {
      const name = "sharp";
      const mod = (await import(/* webpackIgnore: true */ name)) as { default?: SharpFactory };
      return (mod.default ?? (mod as unknown as SharpFactory)) || null;
    } catch {
      return null;
    }
  })();
  return sharpPromise;
}

/** SVG → high-quality JPEG (grainy artwork compresses poorly as PNG; JPEG keeps files well under network limits). */
async function svgToRaster(svg: string): Promise<Uint8Array | null> {
  const sharp = await loadSharp();
  if (!sharp) return null;
  try {
    const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
    return new Uint8Array(buf);
  } catch (err) {
    console.warn("[images] SVG rasterization failed, serving SVG", err);
    return null;
  }
}

/** Cover-crop a raster to exactly w×h (JPEG) when sharp is available. */
async function fitExact(bytes: Uint8Array, w: number, h: number): Promise<{ bytes: Uint8Array; mime: string; width: number; height: number } | null> {
  const sharp = await loadSharp();
  if (!sharp) return null;
  try {
    const buf = await sharp(bytes).resize(w, h, { fit: "cover", position: "attention" }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    return { bytes: new Uint8Array(buf), mime: "image/jpeg", width: w, height: h };
  } catch {
    return null;
  }
}

function pngSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50) return null;
  const u32 = (o: number) => ((b[o] as number) << 24) + ((b[o + 1] as number) << 16) + ((b[o + 2] as number) << 8) + (b[o + 3] as number);
  return { width: u32(16) >>> 0, height: u32(20) >>> 0 };
}

// ───────────────────────────────────────────── remote providers

const STYLE_HINTS: Record<ImageStyle, string> = {
  photo: "photorealistic, natural light, shallow depth of field, editorial photography",
  illustration: "modern flat vector illustration, clean shapes, soft gradients",
  "3d": "3D render, soft studio lighting, glossy materials, subtle shadows",
  minimal: "minimalist composition, generous negative space, simple shapes",
  brand: "polished brand marketing visual, cohesive art direction",
};

/** Plain-language name for a #rrggbb colour (e.g. "deep brown", "cream", "muted sage green"). */
export function colorName(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.12) return l > 0.9 ? "white" : l > 0.7 ? "light grey" : l > 0.35 ? "grey" : l > 0.12 ? "charcoal" : "black";
  let h = 0;
  if (max === r) h = ((g - b) / d + 6) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  const hues: [number, string][] = [
    [15, "red"], [40, "orange"], [65, "yellow"], [90, "lime"], [160, "green"], [190, "teal"],
    [250, "blue"], [290, "purple"], [335, "pink"], [360, "red"],
  ];
  let hue = hues.find(([lim]) => h < lim)![1];
  if ((hue === "orange" || hue === "red") && l < 0.4) hue = "brown";
  if ((hue === "yellow" || hue === "orange") && l > 0.8) return "cream";
  if (hue === "green" && s < 0.35) hue = "sage green";
  const shade = l < 0.25 ? "deep " : l > 0.78 ? "pale " : s < 0.35 ? "muted " : "";
  return `${shade}${hue}`;
}

export function buildImagePrompt(req: ImageGenRequest): string {
  const parts = [req.prompt.trim().slice(0, 3000)];
  if (req.style) parts.push(`Style: ${STYLE_HINTS[req.style]}.`);
  // Describe colours in words: image models paint raw hex codes as literal swatches/text.
  const colors = (req.colors ?? []).map(normalizeHex).filter((c): c is string => !!c);
  const names = [...new Set(colors.slice(0, 5).map(colorName))];
  if (names.length) parts.push(`Colour mood: ${names.join(", ")} tones, applied naturally to the scene.`);
  parts.push(
    "Designed for a social media post. A single cohesive image — no text, numbers, letters, colour swatches, palettes, labels, logos or watermarks.",
  );
  return parts.join(" ");
}

const OPENAI_SIZES: [number, number][] = [
  [1024, 1024],
  [1024, 1536],
  [1536, 1024],
];

export function nearestOpenAiSize(w: number, h: number): [number, number] {
  const target = Math.log(w / h);
  let best = OPENAI_SIZES[0] as [number, number];
  for (const s of OPENAI_SIZES) if (Math.abs(Math.log(s[0] / s[1]) - target) < Math.abs(Math.log(best[0] / best[1]) - target)) best = s;
  return best;
}

const REPLICATE_RATIOS = ["1:1", "16:9", "21:9", "3:2", "2:3", "4:5", "5:4", "3:4", "4:3", "9:16", "9:21"];

export function nearestAspectRatio(w: number, h: number): string {
  const target = Math.log(w / h);
  let best = "1:1";
  let diff = Infinity;
  for (const r of REPLICATE_RATIOS) {
    const [a, b] = r.split(":").map(Number) as [number, number];
    const d = Math.abs(Math.log(a / b) - target);
    if (d < diff) {
      diff = d;
      best = r;
    }
  }
  return best;
}

type FetchLike = typeof fetch;

async function finalizeRaster(bytes: Uint8Array, mime: string, req: { width: number; height: number }, provider: string): Promise<GeneratedImage> {
  const exact = await fitExact(bytes, req.width, req.height);
  if (exact) return { ...exact, provider };
  const size = pngSize(bytes) ?? { width: req.width, height: req.height };
  return { bytes, mime, width: size.width, height: size.height, provider };
}

async function openAiGenerate(req: ImageGenRequest & { count: number }, key: string, fetchImpl: FetchLike): Promise<GeneratedImage[]> {
  const [sw, sh] = nearestOpenAiSize(req.width, req.height);
  const res = await fetchImpl("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-1", prompt: buildImagePrompt(req), n: req.count, size: `${sw}x${sh}` }),
    signal: AbortSignal.timeout(180_000),
  });
  const body = (await res.json().catch(() => null)) as { data?: { b64_json?: string }[]; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(`OpenAI image generation failed: ${body?.error?.message ?? res.status}`);
  const items = (body?.data ?? []).map((d) => d.b64_json).filter((b): b is string => !!b);
  if (!items.length) throw new Error("OpenAI returned no images");
  return Promise.all(items.map((b64) => finalizeRaster(new Uint8Array(Buffer.from(b64, "base64")), "image/png", req, "openai")));
}

async function replicateGenerate(req: ImageGenRequest & { count: number }, token: string, fetchImpl: FetchLike): Promise<GeneratedImage[]> {
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", prefer: "wait" };
  const res = await fetchImpl("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      input: {
        prompt: buildImagePrompt(req),
        aspect_ratio: nearestAspectRatio(req.width, req.height),
        num_outputs: Math.min(4, req.count),
        output_format: "png",
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  type Prediction = { status?: string; output?: string[] | null; error?: string | null; detail?: string; urls?: { get?: string } };
  let pred = (await res.json().catch(() => null)) as Prediction | null;
  if (!res.ok || !pred) throw new Error(`Replicate image generation failed: ${pred?.detail ?? res.status}`);
  const deadline = Date.now() + 90_000;
  while (pred && pred.status !== "succeeded" && pred.status !== "failed" && pred.status !== "canceled" && pred.urls?.get && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetchImpl(pred.urls.get, { headers: { authorization: `Bearer ${token}` } });
    pred = (await poll.json().catch(() => null)) as Prediction | null;
  }
  if (!pred || pred.status !== "succeeded" || !pred.output?.length) throw new Error(`Replicate image generation failed: ${pred?.error ?? pred?.status ?? "no output"}`);
  const out: GeneratedImage[] = [];
  for (const url of pred.output) {
    const img = await fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
    if (!img.ok) throw new Error(`Couldn't download generated image (${img.status})`);
    const bytes = new Uint8Array(await img.arrayBuffer());
    out.push(await finalizeRaster(bytes, img.headers.get("content-type") ?? "image/png", req, "replicate"));
  }
  // flux-schnell caps at 4 outputs per prediction; top up with more predictions if needed
  if (out.length < req.count) out.push(...(await replicateGenerate({ ...req, count: req.count - out.length }, token, fetchImpl)));
  return out.slice(0, req.count);
}

/** The image provider is overloaded (429 / 5xx after retries). Surfaced to users as "busy, try again". */
export class ImageBusyError extends Error {
  constructor(status: number) {
    super(`The image service is busy right now (${status}). Please try again in a minute.`);
    this.name = "ImageBusyError";
  }
}

const BUSY_DELAYS_MS = [2_000, 5_000];
const isBusy = (status: number) => status === 429 || status === 502 || status === 503 || status === 504;

/**
 * Retry a provider call while it reports being busy (429/502/503/504), honouring Retry-After up to 10 s.
 * Other responses (including errors) are returned as-is; a still-busy provider ends in ImageBusyError.
 */
export async function withBusyRetry(call: () => Promise<Response>, delays: readonly number[] = BUSY_DELAYS_MS): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await call();
    if (!isBusy(res.status)) return res;
    if (attempt >= delays.length) throw new ImageBusyError(res.status);
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : delays[attempt]!;
    await res.body?.cancel().catch(() => undefined);
    await new Promise((r) => setTimeout(r, wait));
  }
}

/**
 * OpenAI-compatible image endpoint that returns hosted URLs (Agnes AI: agnes-image-2.5-flash).
 * One request per image (keeps latency predictable), at most 2 in flight.
 */
async function compatGenerate(
  req: ImageGenRequest & { count: number },
  cfg: { baseUrl: string; apiKey: string; model: string },
  fetchImpl: FetchLike,
): Promise<GeneratedImage[]> {
  const [sw, sh] = nearestOpenAiSize(req.width, req.height);
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/images/generations`;
  const one = async (): Promise<GeneratedImage> => {
    const res = await withBusyRetry(() =>
      fetchImpl(url, {
        method: "POST",
        headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: cfg.model, prompt: buildImagePrompt(req), n: 1, size: `${sw}x${sh}` }),
        signal: AbortSignal.timeout(180_000),
      }),
    );
    const body = (await res.json().catch(() => null)) as
      | { data?: { url?: string; b64_json?: string }[]; error?: { message?: string } }
      | null;
    if (!res.ok) throw new Error(`Image generation failed: ${body?.error?.message ?? res.status}`);
    const item = body?.data?.[0];
    if (item?.b64_json) return finalizeRaster(new Uint8Array(Buffer.from(item.b64_json, "base64")), "image/png", req, "agnes");
    if (!item?.url) throw new Error("Image provider returned no image");
    const img = await fetchImpl(item.url, { signal: AbortSignal.timeout(60_000) });
    if (!img.ok) throw new Error(`Couldn't download generated image (${img.status})`);
    return finalizeRaster(new Uint8Array(await img.arrayBuffer()), img.headers.get("content-type") ?? "image/png", req, "agnes");
  };
  const out: GeneratedImage[] = [];
  for (let i = 0; i < req.count; i += 2) {
    out.push(...(await Promise.all(Array.from({ length: Math.min(2, req.count - i) }, one))));
  }
  return out;
}

// ───────────────────────────────────────────── service

export interface ImageServiceOptions {
  fetch?: FetchLike;
  /** Rasterize local artwork to JPEG when sharp is available (default true). */
  rasterize?: boolean;
  /** Env lookup (defaults to process.env) — injectable for tests. */
  env?: Record<string, string | undefined>;
}

/** Local artwork for every requested image (JPEG when sharp is available, SVG otherwise). */
export async function generateLocalArtwork(req: ImageGenRequest, opts: { rasterize?: boolean } = {}): Promise<GeneratedImage[]> {
  const count = clampCount(req.count);
  const w = clampDim(req.width);
  const h = clampDim(req.height);
  const out: GeneratedImage[] = [];
  for (let i = 0; i < count; i++) {
    const svg = renderLocalArtwork({ ...req, width: w, height: h }, i);
    const raster = opts.rasterize === false ? null : await svgToRaster(svg);
    out.push(
      raster
        ? { bytes: raster, mime: "image/jpeg", width: w, height: h, provider: "local-art" }
        : { bytes: new TextEncoder().encode(svg), mime: "image/svg+xml", width: w, height: h, provider: "local-art" },
    );
  }
  return out;
}

export function createImageService(opts: ImageServiceOptions = {}): ImageService {
  const env = () => opts.env ?? process.env;
  const fetchImpl = () => opts.fetch ?? fetch;
  /** IMAGE_MODEL on an OpenAI-compatible host (defaults to the LLM provider's base URL/key). */
  const compat = () => {
    const e = env();
    const baseUrl = e.IMAGE_BASE_URL || e.LLM_BASE_URL;
    const apiKey = e.IMAGE_API_KEY || e.LLM_API_KEY;
    return e.IMAGE_MODEL && baseUrl && apiKey ? { baseUrl, apiKey, model: e.IMAGE_MODEL } : null;
  };
  const provider = () =>
    compat() ? "agnes" : env().OPENAI_API_KEY ? "openai" : env().REPLICATE_API_TOKEN ? "replicate" : "local-art";
  return {
    provider,
    async generate(req) {
      if (!req.prompt?.trim()) throw new Error("Describe the image you want");
      const normalized = { ...req, width: clampDim(req.width), height: clampDim(req.height), count: clampCount(req.count) };
      const p = provider();
      if (p !== "local-art") {
        try {
          if (p === "agnes") return await compatGenerate(normalized, compat()!, fetchImpl());
          return p === "openai"
            ? await openAiGenerate(normalized, env().OPENAI_API_KEY as string, fetchImpl())
            : await replicateGenerate(normalized, env().REPLICATE_API_TOKEN as string, fetchImpl());
        } catch (err) {
          // Keep the product usable when the provider hiccups: fall back to local artwork.
          console.warn(`[images] ${p} failed, falling back to local artwork:`, err instanceof Error ? err.message : err);
        }
      }
      return generateLocalArtwork(normalized, { rasterize: opts.rasterize });
    },
  };
}

/** Default image service (reads provider keys from the environment on every call). */
export const images: ImageService = createImageService();

// Studio scene format (v1). Pure TypeScript — safe to import from server routes and tests.

export interface GradientStop {
  offset: number; // 0..1
  color: string;
}

export interface Gradient {
  kind: "linear" | "radial";
  /** Degrees, 0 = left→right, 90 = top→bottom. Ignored for radial. */
  angle: number;
  stops: GradientStop[];
}

export type Background =
  | { type: "color"; color: string }
  | { type: "gradient"; gradient: Gradient }
  | { type: "image"; src: string; color?: string; overlay?: { color: string; opacity: number } | null };

export interface Shadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

export type LayerType = "text" | "image" | "rect" | "ellipse" | "line" | "star" | "icon";

export interface LayerBase {
  id: string;
  type: LayerType;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  flipX?: boolean;
  flipY?: boolean;
  shadow?: Shadow | null;
}

export interface TextLayer extends LayerBase {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic?: boolean;
  underline?: boolean;
  uppercase?: boolean;
  fill: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
  pill?: { color: string; paddingX: number; paddingY: number; radius: number } | null;
}

export interface ImageFilters {
  brightness: number; // -1..1
  contrast: number; // -100..100
  grayscale: boolean;
  blur: number; // 0..40
}

export interface ImageLayer extends LayerBase {
  type: "image";
  src: string;
  mediaId?: string | null;
  /** Source crop in natural pixels; null = auto "cover". */
  crop?: { x: number; y: number; width: number; height: number } | null;
  cornerRadius: number;
  filters: ImageFilters;
  stroke?: string;
  strokeWidth?: number;
}

export interface ShapeProps {
  fill: string;
  gradient?: Gradient | null;
  stroke: string;
  strokeWidth: number;
}

export interface RectLayer extends LayerBase, ShapeProps {
  type: "rect";
  cornerRadius: number;
}
export interface EllipseLayer extends LayerBase, ShapeProps {
  type: "ellipse";
}
export interface StarLayer extends LayerBase, ShapeProps {
  type: "star";
  numPoints: number;
  innerRatio: number;
}
export interface LineLayer extends LayerBase {
  type: "line";
  stroke: string;
  strokeWidth: number;
  dash: boolean;
}
export interface IconLayer extends LayerBase {
  type: "icon";
  icon: string;
  color: string;
  strokeWidth: number;
}

export type Layer = TextLayer | ImageLayer | RectLayer | EllipseLayer | LineLayer | StarLayer | IconLayer;

export interface Scene {
  version: 1;
  width: number;
  height: number;
  background: Background;
  layers: Layer[];
}

// ───────────── Formats ─────────────

export type Orientation = "square" | "portrait" | "story" | "landscape";

export interface DesignFormat {
  key: string;
  label: string;
  width: number;
  height: number;
}

export const FORMATS: DesignFormat[] = [
  { key: "instagram_post", label: "Instagram post", width: 1080, height: 1080 },
  { key: "instagram_portrait", label: "Instagram portrait", width: 1080, height: 1350 },
  { key: "instagram_story", label: "Story / Reel", width: 1080, height: 1920 },
  { key: "facebook_post", label: "Facebook post", width: 1200, height: 630 },
  { key: "x_post", label: "X post", width: 1600, height: 900 },
  { key: "linkedin_post", label: "LinkedIn post", width: 1200, height: 627 },
  { key: "pinterest_pin", label: "Pinterest pin", width: 1000, height: 1500 },
  { key: "youtube_thumbnail", label: "YouTube thumbnail", width: 1280, height: 720 },
];

export const formatByKey = (key: string) => FORMATS.find((f) => f.key === key);

export function formatLabel(key: string, width: number, height: number) {
  return formatByKey(key)?.label ?? `Custom ${width}×${height}`;
}

export function orientationOf(width: number, height: number): Orientation {
  const r = width / height;
  if (Math.abs(r - 1) < 0.05) return "square";
  if (r > 1) return "landscape";
  return r < 0.65 ? "story" : "portrait";
}

// ───────────── Helpers ─────────────

export function uid(prefix = "l"): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36).slice(-4)}${rnd}`;
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function emptyScene(width: number, height: number, color = "#ffffff"): Scene {
  return { version: 1, width, height, background: { type: "color", color }, layers: [] };
}

const base = (type: LayerType, x: number, y: number, width: number, height: number): LayerBase => ({
  id: uid(type.slice(0, 2)),
  type,
  x,
  y,
  width,
  height,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
});

export const DEFAULT_FILTERS: ImageFilters = { brightness: 0, contrast: 0, grayscale: false, blur: 0 };

export type TextPreset = "heading" | "subheading" | "body" | "caption";

export function createText(scene: Pick<Scene, "width" | "height">, preset: TextPreset = "body", overrides: Partial<TextLayer> = {}): TextLayer {
  const s = Math.min(scene.width, scene.height) / 1080;
  const conf = {
    heading: { text: "Add a heading", fontSize: 96, fontWeight: 800, fontFamily: "Poppins", lineHeight: 1.05, letterSpacing: -1 },
    subheading: { text: "Add a subheading", fontSize: 54, fontWeight: 600, fontFamily: "Poppins", lineHeight: 1.15, letterSpacing: 0 },
    body: { text: "Add a little bit of body text", fontSize: 34, fontWeight: 400, fontFamily: "Inter", lineHeight: 1.4, letterSpacing: 0 },
    caption: { text: "CAPTION TEXT", fontSize: 24, fontWeight: 600, fontFamily: "Inter", lineHeight: 1.3, letterSpacing: 3 },
  }[preset];
  const fontSize = Math.round(conf.fontSize * s);
  const width = Math.round(scene.width * 0.7);
  const height = Math.round(fontSize * conf.lineHeight);
  return {
    ...base("text", Math.round((scene.width - width) / 2), Math.round((scene.height - height) / 2), width, height),
    type: "text",
    text: conf.text,
    fontFamily: conf.fontFamily,
    fontSize,
    fontWeight: conf.fontWeight,
    fill: "#111827",
    align: "center",
    lineHeight: conf.lineHeight,
    letterSpacing: conf.letterSpacing,
    ...overrides,
  } as TextLayer;
}

export type ShapeKind = "rect" | "rounded" | "ellipse" | "line" | "dashed" | "star" | "burst";

export function createShape(scene: Pick<Scene, "width" | "height">, kind: ShapeKind, color = "#6366f1"): Layer {
  const size = Math.round(Math.min(scene.width, scene.height) * 0.3);
  const x = Math.round((scene.width - size) / 2);
  const y = Math.round((scene.height - size) / 2);
  switch (kind) {
    case "rect":
    case "rounded":
      return { ...base("rect", x, y, size, size), type: "rect", fill: color, stroke: "#000000", strokeWidth: 0, cornerRadius: kind === "rounded" ? Math.round(size * 0.18) : 0 };
    case "ellipse":
      return { ...base("ellipse", x, y, size, size), type: "ellipse", fill: color, stroke: "#000000", strokeWidth: 0 };
    case "line":
    case "dashed": {
      const w = Math.round(scene.width * 0.4);
      return { ...base("line", Math.round((scene.width - w) / 2), Math.round(scene.height / 2 - 4), w, 8), type: "line", stroke: color, strokeWidth: 8, dash: kind === "dashed" };
    }
    case "star":
    case "burst":
      return {
        ...base("star", x, y, size, size),
        type: "star",
        fill: color,
        stroke: "#000000",
        strokeWidth: 0,
        numPoints: kind === "star" ? 5 : 12,
        innerRatio: kind === "star" ? 0.45 : 0.78,
      };
  }
}

export function createIcon(scene: Pick<Scene, "width" | "height">, icon: string, color = "#111827"): IconLayer {
  const size = Math.round(Math.min(scene.width, scene.height) * 0.2);
  return { ...base("icon", Math.round((scene.width - size) / 2), Math.round((scene.height - size) / 2), size, size), type: "icon", icon, color, strokeWidth: 1.75 };
}

/** New image layer, fitted to ~60% of the canvas keeping its natural ratio. */
export function createImage(
  scene: Pick<Scene, "width" | "height">,
  src: string,
  natural: { width: number; height: number },
  extra: Partial<ImageLayer> = {},
): ImageLayer {
  const nw = natural.width || 1000;
  const nh = natural.height || 1000;
  const fit = Math.min((scene.width * 0.6) / nw, (scene.height * 0.6) / nh);
  const width = Math.round(nw * fit);
  const height = Math.round(nh * fit);
  return {
    ...base("image", Math.round((scene.width - width) / 2), Math.round((scene.height - height) / 2), width, height),
    type: "image",
    src,
    crop: null,
    cornerRadius: 0,
    filters: { ...DEFAULT_FILTERS },
    ...extra,
  };
}

export function layerLabel(l: Layer): string {
  if (l.name) return l.name;
  switch (l.type) {
    case "text":
      return l.text.split("\n")[0]!.slice(0, 32) || "Text";
    case "image":
      return "Image";
    case "rect":
      return l.cornerRadius ? "Rounded rectangle" : "Rectangle";
    case "ellipse":
      return "Ellipse";
    case "line":
      return "Line";
    case "star":
      return l.numPoints > 6 ? "Burst" : "Star";
    case "icon":
      return `Icon · ${l.icon}`;
  }
}

/** Axis-aligned bounds of a layer, accounting for rotation around its top-left origin. */
export function layerBounds(l: Pick<Layer, "x" | "y" | "width" | "height" | "rotation">) {
  const rad = (l.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const pts = [
    [0, 0],
    [l.width, 0],
    [l.width, l.height],
    [0, l.height],
  ].map(([px, py]) => [l.x + px! * cos - py! * sin, l.y + px! * sin + py! * cos] as const);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

export function cloneScene<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Deep copies with fresh ids, offset by `offset` px. */
export function duplicateLayers(layers: Layer[], offset = 24): Layer[] {
  return layers.map((l) => ({ ...cloneScene(l), id: uid(l.type.slice(0, 2)), x: l.x + offset, y: l.y + offset, locked: false }));
}

/**
 * Resize a scene to a new canvas size, scaling layers proportionally:
 * sizes scale uniformly by min(sx, sy) (no distortion), centres move with the canvas (sx, sy),
 * and full-bleed layers (spanning ≥ 98% of an axis) stretch along that axis.
 * A layer that was inside the canvas stays inside it.
 */
export function resizeScene(scene: Scene, width: number, height: number): Scene {
  const sx = width / scene.width;
  const sy = height / scene.height;
  const s = Math.min(sx, sy);
  const layers = scene.layers.map((l): Layer => {
    const fullW = l.rotation === 0 && l.width >= scene.width * 0.98;
    const fullH = l.rotation === 0 && l.height >= scene.height * 0.98;
    const cx = l.x + l.width / 2;
    const cy = l.y + l.height / 2;
    const w = fullW ? l.width * sx : l.width * s;
    const h = fullH ? l.height * sy : l.height * s;
    const next = { ...cloneScene(l), x: cx * sx - w / 2, y: cy * sy - h / 2, width: w, height: h } as Layer;
    if (next.shadow) next.shadow = { ...next.shadow, blur: next.shadow.blur * s, offsetX: next.shadow.offsetX * s, offsetY: next.shadow.offsetY * s };
    switch (next.type) {
      case "text":
        next.fontSize = Math.max(4, next.fontSize * s);
        next.letterSpacing = next.letterSpacing * s;
        if (next.pill) next.pill = { ...next.pill, paddingX: next.pill.paddingX * s, paddingY: next.pill.paddingY * s, radius: next.pill.radius * s };
        break;
      case "rect":
        next.cornerRadius = next.cornerRadius * s;
        next.strokeWidth = next.strokeWidth * s;
        break;
      case "ellipse":
      case "star":
        next.strokeWidth = next.strokeWidth * s;
        break;
      case "line":
        next.strokeWidth = next.strokeWidth * s;
        break;
      case "image":
        next.cornerRadius = next.cornerRadius * s;
        next.crop = null; // re-fit to the new box
        break;
      case "icon":
        break;
    }
    return roundLayer(next);
  });
  return { ...scene, width, height, layers };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
function roundLayer<L extends Layer>(l: L): L {
  return { ...l, x: r2(l.x), y: r2(l.y), width: r2(l.width), height: r2(l.height) };
}

// ───────────── Colours ─────────────

export function normalizeHex(c: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return c.trim().toLowerCase();
  let h = m[1]!.toLowerCase();
  if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
  return `#${h}`;
}

function mapGradient(g: Gradient, f: (c: string) => string): Gradient {
  return { ...g, stops: g.stops.map((s) => ({ ...s, color: f(s.color) })) };
}

/** Apply a colour mapping to every colour in the scene (fills, strokes, gradients, background, pills, shadows). */
export function mapSceneColors(scene: Scene, f: (c: string) => string): Scene {
  const bg: Background =
    scene.background.type === "color"
      ? { type: "color", color: f(scene.background.color) }
      : scene.background.type === "gradient"
        ? { type: "gradient", gradient: mapGradient(scene.background.gradient, f) }
        : { ...scene.background };
  const layers = scene.layers.map((src) => {
    const l = cloneScene(src);
    switch (l.type) {
      case "text":
        l.fill = f(l.fill);
        if (l.pill) l.pill.color = f(l.pill.color);
        break;
      case "rect":
      case "ellipse":
      case "star":
        l.fill = f(l.fill);
        l.stroke = f(l.stroke);
        if (l.gradient) l.gradient = mapGradient(l.gradient, f);
        break;
      case "line":
        l.stroke = f(l.stroke);
        break;
      case "icon":
        l.color = f(l.color);
        break;
      case "image":
        if (l.stroke) l.stroke = f(l.stroke);
        break;
    }
    return l;
  });
  return { ...scene, background: bg, layers };
}

/** Relative luminance (0..1) of a hex colour. */
export function luminance(hex: string): number {
  const h = normalizeHex(hex);
  if (!/^#[0-9a-f]{6}$/.test(h)) return 0.5;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/**
 * Swap a template's accent colours for the brand's colours (accent[i] → brand[i]).
 * Accents beyond the number of brand colours keep their original colour so layouts keep contrast;
 * non-accent colours (neutrals, text) are left alone.
 */
export function applyBrandColors(scene: Scene, accents: string[], brandColors: string[]): Scene {
  const brand = brandColors.map(normalizeHex).filter((c) => /^#[0-9a-f]{6}$/.test(c));
  if (!brand.length || !accents.length) return cloneScene(scene);
  const map = new Map<string, string>();
  accents.slice(0, brand.length).forEach((a, i) => map.set(normalizeHex(a), brand[i]!));
  return mapSceneColors(scene, (c) => map.get(normalizeHex(c)) ?? c);
}

/** All distinct solid colours used in a scene (for the "document colours" swatch row). */
export function sceneColors(scene: Scene): string[] {
  const out = new Set<string>();
  mapSceneColors(scene, (c) => {
    if (/^#[0-9a-f]{3,8}$/i.test(c)) out.add(normalizeHex(c));
    return c;
  });
  return [...out];
}

export function cssGradient(g: Gradient): string {
  const stops = g.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(", ");
  return g.kind === "radial" ? `radial-gradient(circle, ${stops})` : `linear-gradient(${g.angle + 90}deg, ${stops})`;
}

/** Konva linear gradient endpoints for a box. */
export function gradientPoints(g: Gradient, w: number, h: number) {
  const rad = (g.angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = w / 2;
  const cy = h / 2;
  return { start: { x: cx - dx * half, y: cy - dy * half }, end: { x: cx + dx * half, y: cy + dy * half } };
}

export function gradientColorStops(g: Gradient): (string | number)[] {
  return g.stops.flatMap((s) => [s.offset, s.color]);
}

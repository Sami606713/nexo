"use client";

// Imperative Konva renderer for Studio scenes.
// (react-konva@19.3 is incompatible with the React 19.2 canary bundled by Next 15.5, so we drive Konva directly.)

import Konva from "konva";
import { nearestWeight } from "../fonts";
import { iconDataUrl } from "../icons";
import { canvasSrc } from "../client";
import { gradientColorStops, gradientPoints, type Background, type Gradient, type ImageLayer, type Layer, type Shadow, type TextLayer } from "../scene";

// ───────────── images ─────────────

type ImgEntry = { img: HTMLImageElement; loaded: boolean; failed: boolean; waiters: Set<() => void> };
const images = new Map<string, ImgEntry>();

/** Returns a loaded image, or null and calls `onLoad` once it is ready. */
export function getImage(src: string, onLoad?: () => void): HTMLImageElement | null {
  let e = images.get(src);
  if (!e) {
    const img = new window.Image();
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    const entry: ImgEntry = { img, loaded: false, failed: false, waiters: new Set() };
    img.onload = () => {
      entry.loaded = true;
      entry.waiters.forEach((w) => w());
      entry.waiters.clear();
    };
    img.onerror = () => {
      entry.failed = true;
      entry.waiters.clear();
    };
    img.src = src;
    images.set(src, entry);
    e = entry;
  }
  if (e.loaded) return e.img;
  if (onLoad && !e.failed) e.waiters.add(onLoad);
  return null;
}

/** Resolves when every image the scene references has loaded (or failed). */
export function whenImagesReady(srcs: string[]): Promise<void> {
  return Promise.all(
    srcs.map(
      (s) =>
        new Promise<void>((resolve) => {
          const e = images.get(s);
          if (!e || e.loaded || e.failed) return resolve();
          e.waiters.add(resolve);
          setTimeout(resolve, 8000);
        }),
    ),
  ).then(() => undefined);
}

// ───────────── helpers ─────────────

export const fontStyle = (l: Pick<TextLayer, "fontFamily" | "fontWeight" | "italic">) =>
  `${l.italic ? "italic " : ""}${nearestWeight(l.fontFamily, l.fontWeight)}`;

export const displayText = (l: TextLayer) => (l.uppercase ? l.text.toUpperCase() : l.text);

/** Measure a text layer's laid-out height and widest line. */
export function measureText(l: TextLayer): { height: number; lineWidth: number } {
  const t = new Konva.Text({
    text: displayText(l) || " ",
    width: Math.max(1, l.width),
    fontFamily: l.fontFamily,
    fontSize: l.fontSize,
    fontStyle: fontStyle(l),
    lineHeight: l.lineHeight,
    letterSpacing: l.letterSpacing,
    align: l.align,
    wrap: "word",
  });
  const out = { height: t.height(), lineWidth: Math.min(l.width, t.getTextWidth()) };
  t.destroy();
  return out;
}

function shadowAttrs(s: Shadow | null | undefined): Konva.ShapeConfig {
  if (!s) return { shadowEnabled: false };
  return { shadowColor: s.color, shadowBlur: s.blur, shadowOffsetX: s.offsetX, shadowOffsetY: s.offsetY, shadowOpacity: s.opacity, shadowEnabled: true };
}

export function fillAttrs(fill: string, g: Gradient | null | undefined, w: number, h: number, ox = 0, oy = 0): Konva.ShapeConfig {
  if (!g) return { fill, fillPriority: "color" };
  if (g.kind === "radial") {
    const c = { x: ox + w / 2, y: oy + h / 2 };
    return {
      fillPriority: "radial-gradient",
      fillRadialGradientStartPoint: c,
      fillRadialGradientEndPoint: c,
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndRadius: Math.hypot(w, h) / 2,
      fillRadialGradientColorStops: gradientColorStops(g),
    };
  }
  const p = gradientPoints(g, w, h);
  return {
    fillPriority: "linear-gradient",
    fillLinearGradientStartPoint: { x: p.start.x + ox, y: p.start.y + oy },
    fillLinearGradientEndPoint: { x: p.end.x + ox, y: p.end.y + oy },
    fillLinearGradientColorStops: gradientColorStops(g),
  };
}

/** Source rect that makes an image "cover" a w×h box. */
export function coverCrop(nw: number, nh: number, w: number, h: number) {
  const r = Math.max(w / nw, h / nh);
  const cw = w / r;
  const ch = h / r;
  return { x: (nw - cw) / 2, y: (nh - ch) / 2, width: cw, height: ch };
}

// ───────────── layer content ─────────────

export interface RenderHooks {
  /** Called when an async asset (image/icon) finished loading and the node was updated. */
  redraw: () => void;
  /** Text layers report their laid-out height so the stored scene stays accurate. */
  onMeasure?: (id: string, height: number) => void;
}

function textContent(l: TextLayer, hooks: RenderHooks): Konva.Node[] {
  const m = measureText(l);
  if (hooks.onMeasure && Math.abs(m.height - l.height) > 0.5) {
    const cb = hooks.onMeasure;
    queueMicrotask(() => cb(l.id, m.height));
  }
  const out: Konva.Node[] = [];
  const pill = l.pill;
  if (pill) {
    const pillX = l.align === "center" ? (l.width - m.lineWidth) / 2 : l.align === "right" ? l.width - m.lineWidth : 0;
    const h = m.height + pill.paddingY * 2;
    out.push(
      new Konva.Rect({
        name: "pill",
        x: pillX - pill.paddingX,
        y: -pill.paddingY,
        width: m.lineWidth + pill.paddingX * 2,
        height: h,
        cornerRadius: Math.min(pill.radius, h / 2),
        fill: pill.color,
        ...shadowAttrs(l.shadow),
      }),
    );
  }
  out.push(
    new Konva.Text({
      name: "text",
      text: displayText(l),
      width: l.width,
      fontFamily: l.fontFamily,
      fontSize: l.fontSize,
      fontStyle: fontStyle(l),
      textDecoration: l.underline ? "underline" : "",
      fill: l.fill,
      align: l.align,
      lineHeight: l.lineHeight,
      letterSpacing: l.letterSpacing,
      wrap: "word",
      ...(pill ? {} : shadowAttrs(l.shadow)),
    }),
  );
  return out;
}

function imageContent(l: ImageLayer, hooks: RenderHooks, parent: () => Konva.Group | null): Konva.Node[] {
  const src = canvasSrc(l.src);
  const build = (img: HTMLImageElement) => {
    const f = l.filters;
    const filters = [
      ...(f.brightness !== 0 ? [Konva.Filters.Brighten] : []),
      ...(f.contrast !== 0 ? [Konva.Filters.Contrast] : []),
      ...(f.grayscale ? [Konva.Filters.Grayscale] : []),
      ...(f.blur > 0 ? [Konva.Filters.Blur] : []),
    ];
    const node = new Konva.Image({
      image: img,
      width: l.width,
      height: l.height,
      crop: l.crop ?? coverCrop(img.naturalWidth, img.naturalHeight, l.width, l.height),
      cornerRadius: l.cornerRadius,
      stroke: l.strokeWidth ? l.stroke : undefined,
      strokeWidth: l.strokeWidth ?? 0,
      ...shadowAttrs(l.shadow),
    });
    if (filters.length) {
      node.filters(filters);
      node.brightness(f.brightness);
      node.contrast(f.contrast);
      node.blurRadius(f.blur);
      node.cache({ pixelRatio: 1 });
    }
    return node;
  };
  const img = getImage(src, () => {
    const g = parent();
    const loaded = getImage(src);
    if (!g || !loaded) return;
    g.destroyChildren();
    g.add(build(loaded));
    hooks.redraw();
  });
  if (img) return [build(img)];
  return [new Konva.Rect({ width: l.width, height: l.height, fill: "#d1d5db", cornerRadius: l.cornerRadius })];
}

function iconContent(l: Extract<Layer, { type: "icon" }>, hooks: RenderHooks, parent: () => Konva.Group | null): Konva.Node[] {
  const src = iconDataUrl(l.icon, l.color, l.strokeWidth);
  const hit = new Konva.Rect({ width: l.width, height: l.height, fill: "rgba(0,0,0,0)" });
  const build = (img: HTMLImageElement) => new Konva.Image({ image: img, width: l.width, height: l.height, ...shadowAttrs(l.shadow) });
  const img = getImage(src, () => {
    const g = parent();
    const loaded = getImage(src);
    if (!g || !loaded) return;
    g.add(build(loaded));
    hooks.redraw();
  });
  return img ? [hit, build(img)] : [hit];
}

function content(l: Layer, hooks: RenderHooks, parent: () => Konva.Group | null): Konva.Node[] {
  switch (l.type) {
    case "text":
      return textContent(l, hooks);
    case "image":
      return imageContent(l, hooks, parent);
    case "icon":
      return iconContent(l, hooks, parent);
    case "rect":
      return [
        new Konva.Rect({
          width: l.width,
          height: l.height,
          cornerRadius: Math.min(l.cornerRadius, l.width / 2, l.height / 2),
          ...fillAttrs(l.fill, l.gradient, l.width, l.height),
          stroke: l.strokeWidth ? l.stroke : undefined,
          strokeWidth: l.strokeWidth,
          ...shadowAttrs(l.shadow),
        }),
      ];
    case "ellipse":
      return [
        new Konva.Ellipse({
          x: l.width / 2,
          y: l.height / 2,
          radiusX: l.width / 2,
          radiusY: l.height / 2,
          ...fillAttrs(l.fill, l.gradient, l.width, l.height, -l.width / 2, -l.height / 2),
          stroke: l.strokeWidth ? l.stroke : undefined,
          strokeWidth: l.strokeWidth,
          ...shadowAttrs(l.shadow),
        }),
      ];
    case "star": {
      const r = Math.min(l.width, l.height) / 2 || 1;
      return [
        new Konva.Star({
          x: l.width / 2,
          y: l.height / 2,
          numPoints: l.numPoints,
          outerRadius: r,
          innerRadius: r * l.innerRatio,
          scaleX: l.width / 2 / r,
          scaleY: l.height / 2 / r,
          ...fillAttrs(l.fill, l.gradient, 2 * r, 2 * r, -r, -r),
          stroke: l.strokeWidth ? l.stroke : undefined,
          strokeWidth: l.strokeWidth,
          ...shadowAttrs(l.shadow),
        }),
      ];
    }
    case "line":
      return [
        new Konva.Rect({ width: l.width, height: l.height, fill: "rgba(0,0,0,0)" }),
        new Konva.Line({
          points: [0, l.height / 2, l.width, l.height / 2],
          stroke: l.stroke,
          strokeWidth: l.strokeWidth,
          dash: l.dash ? [l.strokeWidth * 2.2, l.strokeWidth * 1.6] : undefined,
          lineCap: "round",
          hitStrokeWidth: Math.max(20, l.strokeWidth),
          ...shadowAttrs(l.shadow),
        }),
      ];
  }
}

/** Build (or rebuild) the Konva group for a layer. The outer group is reused when given. */
export function renderLayer(l: Layer, hooks: RenderHooks, existing?: Konva.Group): Konva.Group {
  const g = existing ?? new Konva.Group({ name: "layer" });
  g.setAttrs({ id: l.id, x: l.x, y: l.y, rotation: l.rotation, opacity: l.opacity, visible: !l.hidden, scaleX: 1, scaleY: 1 });
  g.destroyChildren();
  const inner = new Konva.Group({ scaleX: l.flipX ? -1 : 1, scaleY: l.flipY ? -1 : 1, x: l.flipX ? l.width : 0, y: l.flipY ? l.height : 0 });
  g.add(inner);
  inner.add(...(content(l, hooks, () => (inner.getParent() ? inner : null)) as (Konva.Shape | Konva.Group)[]));
  return g;
}

export function renderBackground(bg: Background, width: number, height: number, hooks: RenderHooks, g: Konva.Group) {
  g.destroyChildren();
  if (bg.type === "color") {
    g.add(new Konva.Rect({ name: "bg", width, height, fill: bg.color }));
    return;
  }
  if (bg.type === "gradient") {
    g.add(new Konva.Rect({ name: "bg", width, height, ...fillAttrs("#ffffff", bg.gradient, width, height) }));
    return;
  }
  g.add(new Konva.Rect({ name: "bg", width, height, fill: bg.color ?? "#d1d5db" }));
  const src = canvasSrc(bg.src);
  const overlay = () =>
    bg.overlay && bg.overlay.opacity > 0 ? new Konva.Rect({ name: "bg", width, height, fill: bg.overlay.color, opacity: bg.overlay.opacity }) : null;
  const add = (img: HTMLImageElement) => {
    g.add(new Konva.Image({ name: "bg", image: img, width, height, crop: coverCrop(img.naturalWidth, img.naturalHeight, width, height) }));
    const o = overlay();
    if (o) g.add(o);
  };
  const img = getImage(src, () => {
    const loaded = getImage(src);
    if (!loaded || !g.getParent()) return;
    g.find(".bg").forEach((n, i) => i > 0 && n.destroy());
    add(loaded);
    hooks.redraw();
  });
  if (img) add(img);
  else {
    const o = overlay();
    if (o) g.add(o);
  }
}

/** Keeps a Konva container in sync with a scene's layers, rebuilding only layers whose object changed. */
export class SceneSync {
  private nodes = new Map<string, { layer: Layer; group: Konva.Group }>();
  private bg: Background | null = null;
  private bgSize = "";
  private fontsVersion = -1;

  constructor(
    private readonly bgGroup: Konva.Group,
    private readonly layersGroup: Konva.Group,
    private readonly hooks: RenderHooks,
    private readonly onCreate?: (g: Konva.Group, id: string) => void,
  ) {}

  sync(scene: { width: number; height: number; background: Background; layers: Layer[] }, fontsVersion = 0) {
    const fontsChanged = fontsVersion !== this.fontsVersion;
    this.fontsVersion = fontsVersion;
    const size = `${scene.width}x${scene.height}`;
    if (scene.background !== this.bg || size !== this.bgSize) {
      renderBackground(scene.background, scene.width, scene.height, this.hooks, this.bgGroup);
      this.bg = scene.background;
      this.bgSize = size;
    }
    const seen = new Set<string>();
    scene.layers.forEach((l, i) => {
      seen.add(l.id);
      const cur = this.nodes.get(l.id);
      if (!cur) {
        const g = renderLayer(l, this.hooks);
        this.onCreate?.(g, l.id);
        this.layersGroup.add(g);
        this.nodes.set(l.id, { layer: l, group: g });
      } else if (cur.layer !== l || (fontsChanged && l.type === "text")) {
        renderLayer(l, this.hooks, cur.group);
        cur.layer = l;
      }
      const g = this.nodes.get(l.id)!.group;
      if (g.zIndex() !== i) g.zIndex(i);
    });
    for (const [id, n] of this.nodes)
      if (!seen.has(id)) {
        n.group.destroy();
        this.nodes.delete(id);
      }
  }

  group(id: string) {
    return this.nodes.get(id)?.group;
  }

  /** Force a re-render of one layer (e.g. after an imperative transform was cancelled). */
  refresh(l: Layer) {
    const cur = this.nodes.get(l.id);
    if (cur) {
      renderLayer(l, this.hooks, cur.group);
      cur.layer = l;
    }
  }
}

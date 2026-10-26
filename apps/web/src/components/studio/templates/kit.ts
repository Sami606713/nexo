import type {
  Background,
  EllipseLayer,
  Gradient,
  IconLayer,
  Layer,
  LineLayer,
  RectLayer,
  Scene,
  Shadow,
  StarLayer,
  TextLayer,
} from "../scene";

export type TemplateCategory =
  | "promotion"
  | "quote"
  | "announcement"
  | "tips"
  | "event"
  | "testimonial"
  | "hiring"
  | "launch";

export const TEMPLATE_CATEGORIES: { value: TemplateCategory; label: string }[] = [
  { value: "promotion", label: "Promotion & sale" },
  { value: "quote", label: "Quote" },
  { value: "announcement", label: "Announcement" },
  { value: "tips", label: "Tips & listicle" },
  { value: "event", label: "Event" },
  { value: "testimonial", label: "Testimonial" },
  { value: "hiring", label: "Hiring" },
  { value: "launch", label: "Product launch" },
];

export interface StudioTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  /** Format key from FORMATS. */
  format: string;
  /** Accent colours, most prominent first — swapped for brand colours on apply. */
  accents: string[];
  tags: string[];
  scene: Scene;
}

type Common = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  name?: string;
  shadow?: Shadow | null;
  locked?: boolean;
};

export const linear = (angle: number, ...colors: string[]): Gradient => ({
  kind: "linear",
  angle,
  stops: colors.map((color, i) => ({ offset: colors.length === 1 ? 0 : i / (colors.length - 1), color })),
});
export const radial = (...colors: string[]): Gradient => ({
  kind: "radial",
  angle: 0,
  stops: colors.map((color, i) => ({ offset: i / (colors.length - 1), color })),
});

export const softShadow = (opacity = 0.18, blur = 40, y = 16): Shadow => ({ color: "#000000", blur, offsetX: 0, offsetY: y, opacity });

/** Build a template with stable, unique layer ids (`<templateId>-<n>`). */
export function template(
  meta: Omit<StudioTemplate, "scene">,
  size: { width: number; height: number },
  background: Background,
  build: (k: Kit) => void,
): StudioTemplate {
  const layers: Layer[] = [];
  let n = 0;
  const id = () => `${meta.id}-${++n}`;
  const common = (o: Common) => ({
    id: id(),
    name: o.name,
    x: o.x,
    y: o.y,
    width: o.w,
    height: o.h,
    rotation: o.rotation ?? 0,
    opacity: o.opacity ?? 1,
    locked: o.locked ?? false,
    hidden: false,
    shadow: o.shadow ?? null,
  });
  const k: Kit = {
    width: size.width,
    height: size.height,
    text(o) {
      const lines = o.text.split("\n").length;
      const fontSize = o.size;
      const lineHeight = o.lineHeight ?? 1.2;
      const l: TextLayer = {
        ...common({ ...o, h: o.h ?? Math.ceil(lines * fontSize * lineHeight) }),
        type: "text",
        text: o.text,
        fontFamily: o.font ?? "Inter",
        fontSize,
        fontWeight: o.weight ?? 400,
        italic: o.italic,
        uppercase: o.uppercase,
        fill: o.color ?? "#111827",
        align: o.align ?? "left",
        lineHeight,
        letterSpacing: o.spacing ?? 0,
        pill: o.pill ?? null,
      };
      layers.push(l);
      return l;
    },
    rect(o) {
      const l: RectLayer = {
        ...common(o),
        type: "rect",
        fill: o.fill ?? "#000000",
        gradient: o.gradient ?? null,
        stroke: o.stroke ?? "#000000",
        strokeWidth: o.strokeWidth ?? 0,
        cornerRadius: o.radius ?? 0,
      };
      layers.push(l);
      return l;
    },
    ellipse(o) {
      const l: EllipseLayer = {
        ...common(o),
        type: "ellipse",
        fill: o.fill ?? "#000000",
        gradient: o.gradient ?? null,
        stroke: o.stroke ?? "#000000",
        strokeWidth: o.strokeWidth ?? 0,
      };
      layers.push(l);
      return l;
    },
    star(o) {
      const l: StarLayer = {
        ...common(o),
        type: "star",
        fill: o.fill ?? "#000000",
        gradient: o.gradient ?? null,
        stroke: o.stroke ?? "#000000",
        strokeWidth: o.strokeWidth ?? 0,
        numPoints: o.points ?? 5,
        innerRatio: o.inner ?? 0.45,
      };
      layers.push(l);
      return l;
    },
    line(o) {
      const l: LineLayer = { ...common(o), type: "line", stroke: o.stroke, strokeWidth: o.strokeWidth ?? o.h, dash: o.dash ?? false };
      layers.push(l);
      return l;
    },
    icon(o) {
      const l: IconLayer = { ...common({ ...o, h: o.h ?? o.w }), type: "icon", icon: o.icon, color: o.color, strokeWidth: o.strokeWidth ?? 1.75 };
      layers.push(l);
      return l;
    },
  };
  build(k);
  return { ...meta, scene: { version: 1, width: size.width, height: size.height, background, layers } };
}

export interface Kit {
  width: number;
  height: number;
  text(
    o: Omit<Common, "h"> & {
      h?: number;
      text: string;
      size: number;
      font?: string;
      weight?: number;
      italic?: boolean;
      uppercase?: boolean;
      color?: string;
      align?: TextLayer["align"];
      lineHeight?: number;
      spacing?: number;
      pill?: TextLayer["pill"];
    },
  ): TextLayer;
  rect(o: Common & { fill?: string; gradient?: Gradient | null; stroke?: string; strokeWidth?: number; radius?: number }): RectLayer;
  ellipse(o: Common & { fill?: string; gradient?: Gradient | null; stroke?: string; strokeWidth?: number }): EllipseLayer;
  star(o: Common & { fill?: string; gradient?: Gradient | null; stroke?: string; strokeWidth?: number; points?: number; inner?: number }): StarLayer;
  line(o: Common & { stroke: string; strokeWidth?: number; dash?: boolean }): LineLayer;
  icon(o: Omit<Common, "h"> & { h?: number; icon: string; color: string; strokeWidth?: number }): IconLayer;
}

export const SQ = { width: 1080, height: 1080 };
export const PT = { width: 1080, height: 1350 };
export const ST = { width: 1080, height: 1920 };
export const FB = { width: 1200, height: 630 };
export const LI = { width: 1200, height: 627 };
export const XP = { width: 1600, height: 900 };
export const YT = { width: 1280, height: 720 };
export const PIN = { width: 1000, height: 1500 };

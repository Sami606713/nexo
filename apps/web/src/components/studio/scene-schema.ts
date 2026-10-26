import { z } from "zod";
import type { Scene } from "./scene";

const num = z.number().finite();
const color = z.string().max(64);
const gradient = z.object({
  kind: z.enum(["linear", "radial"]),
  angle: num,
  stops: z.array(z.object({ offset: num.min(0).max(1), color })).min(2).max(8),
});
const shadow = z.object({ color, blur: num, offsetX: num, offsetY: num, opacity: num }).nullable().optional();

const base = {
  id: z.string().min(1).max(64),
  name: z.string().max(120).optional(),
  x: num,
  y: num,
  width: num.min(0),
  height: num.min(0),
  rotation: num,
  opacity: num.min(0).max(1),
  locked: z.boolean(),
  hidden: z.boolean(),
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
  shadow,
};
const shape = { fill: color, gradient: gradient.nullable().optional(), stroke: color, strokeWidth: num.min(0) };
const src = z.string().max(4_000_000); // data: URLs for small assets are allowed

const layer = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("text"),
    text: z.string().max(5000),
    fontFamily: z.string().max(80),
    fontSize: num.positive(),
    fontWeight: num,
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    uppercase: z.boolean().optional(),
    fill: color,
    align: z.enum(["left", "center", "right"]),
    lineHeight: num.positive(),
    letterSpacing: num,
    pill: z.object({ color, paddingX: num, paddingY: num, radius: num }).nullable().optional(),
  }),
  z.object({
    ...base,
    type: z.literal("image"),
    src,
    mediaId: z.string().nullable().optional(),
    crop: z.object({ x: num, y: num, width: num, height: num }).nullable().optional(),
    cornerRadius: num.min(0),
    filters: z.object({ brightness: num, contrast: num, grayscale: z.boolean(), blur: num }),
    stroke: color.optional(),
    strokeWidth: num.optional(),
  }),
  z.object({ ...base, ...shape, type: z.literal("rect"), cornerRadius: num.min(0) }),
  z.object({ ...base, ...shape, type: z.literal("ellipse") }),
  z.object({ ...base, ...shape, type: z.literal("star"), numPoints: z.number().int().min(3).max(60), innerRatio: num.min(0.05).max(1) }),
  z.object({ ...base, type: z.literal("line"), stroke: color, strokeWidth: num.min(0), dash: z.boolean() }),
  z.object({ ...base, type: z.literal("icon"), icon: z.string().max(64), color, strokeWidth: num.positive() }),
]);

const background = z.discriminatedUnion("type", [
  z.object({ type: z.literal("color"), color }),
  z.object({ type: z.literal("gradient"), gradient }),
  z.object({
    type: z.literal("image"),
    src,
    color: color.optional(),
    overlay: z.object({ color, opacity: num.min(0).max(1) }).nullable().optional(),
  }),
]);

export const sceneSchema = z.object({
  version: z.literal(1),
  width: z.number().int().min(50).max(8000),
  height: z.number().int().min(50).max(8000),
  background,
  layers: z.array(layer).max(500),
});

export function parseScene(raw: unknown): Scene {
  return sceneSchema.parse(raw) as Scene;
}

export function safeParseScene(raw: unknown): Scene | null {
  const r = sceneSchema.safeParse(raw);
  return r.success ? (r.data as Scene) : null;
}

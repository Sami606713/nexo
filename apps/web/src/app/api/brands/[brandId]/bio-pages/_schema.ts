import "server-only";
import { z } from "zod";
import { prisma } from "@postline/db";
import { RESERVED_SLUGS, SLUG_RE } from "@/components/bio/types";

const url = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === "" || v.startsWith("/") || /^(https?:|mailto:|tel:)/i.test(v), "Links must start with https://, mailto: or tel:");

export const blockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(["link", "header", "social", "image", "embed", "text"]),
  label: z.string().max(200).optional(),
  url: url.optional(),
  text: z.string().max(2000).optional(),
  imageUrl: url.optional(),
  links: z.array(z.object({ network: z.string().max(32), url })).max(20).optional(),
  hidden: z.boolean().optional(),
});

export const themeSchema = z.object({
  background: z.object({ type: z.enum(["solid", "gradient"]), value: z.string().max(300).regex(/^[#a-z0-9(),.%\s-]+$/i, "Invalid background") }),
  buttonStyle: z.enum(["filled", "outline", "soft", "pill"]),
  font: z.enum(["inter", "serif", "mono", "rounded", "grotesk"]),
  accent: z.string().regex(/^#[0-9a-f]{3,8}$/i),
  textColor: z.string().regex(/^#[0-9a-f]{3,8}$/i).optional(),
});

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SLUG_RE, "Use 3–40 lowercase letters, numbers or dashes")
  .refine((s) => !RESERVED_SLUGS.has(s), "That address is reserved");

export const pageSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(120),
  bio: z.string().max(500).nullable().optional(),
  avatarUrl: url.nullable().optional(),
  theme: themeSchema,
  blocks: z.array(blockSchema).max(60),
  published: z.boolean(),
});

export async function slugAvailable(slug: string, excludeId?: string): Promise<boolean> {
  const hit = await prisma.bioPage.findUnique({ where: { slug }, select: { id: true } });
  return !hit || hit.id === excludeId;
}

export const pageSelect = {
  id: true,
  slug: true,
  title: true,
  bio: true,
  avatarUrl: true,
  theme: true,
  blocks: true,
  published: true,
  createdAt: true,
  updatedAt: true,
} as const;

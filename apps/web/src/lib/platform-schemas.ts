// OWNED BY: web-platform agent.
import { z } from "zod";

export const labelSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  color: z.string().trim().min(1).max(30),
});

const normalizeTags = (tags: string[]) =>
  Array.from(new Set(tags.map((t) => t.trim().replace(/^#+/, "").replace(/\s+/g, "")).filter(Boolean).map((t) => `#${t}`)));

export const hashtagLibrarySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  tags: z.array(z.string().max(100)).max(100).transform(normalizeTags),
});

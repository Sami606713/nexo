import { z } from "zod";

export const TONES = ["professional", "friendly", "witty", "bold", "inspirational", "educational"] as const;
export const LENGTHS = ["short", "medium", "long"] as const;
export const REWRITE_ACTIONS = ["rewrite", "shorten", "expand", "fix_grammar", "change_tone", "translate"] as const;
export const SCORE_CHECK_IDS = [
  "substance",
  "hook",
  "length_fit",
  "takeaway",
  "scannable",
  "cta",
  "media",
  "hashtags",
  "links",
  "readability",
  "spam",
] as const;

export const aiPostInput = z.object({
  prompt: z.string().trim().min(3, "Describe the post you want to create").max(4000),
  channelIds: z.array(z.string()).default([]),
  tone: z.enum(TONES).optional(),
  length: z.enum(LENGTHS).optional(),
  includeHashtags: z.boolean().default(true),
  hashtagLibraryId: z.string().nullable().optional(),
  imagesCount: z.number().int().min(0).max(10).optional(),
  language: z.string().max(40).optional(),
});
export type AiPostInput = z.infer<typeof aiPostInput>;

export const aiRewriteInput = z.object({
  text: z.string().trim().min(1, "Select some text first").max(20_000),
  context: z.string().max(200_000).optional(),
  action: z.enum(REWRITE_ACTIONS),
  tone: z.enum(TONES).optional(),
  targetLanguage: z.string().max(40).optional(),
});

export const aiHashtagsInput = z.object({
  caption: z.string().trim().min(1, "Write a caption first").max(200_000),
  channelIds: z.array(z.string()).default([]),
  count: z.number().int().min(1).max(30).optional(),
});

export const aiScoreInput = z.object({
  caption: z.string().max(200_000).default(""),
  channelIds: z.array(z.string()).default([]),
  mediaCount: z.number().int().min(0).default(0),
  useLlm: z.boolean().default(false),
});

export const aiScoreFixInput = z.object({
  caption: z.string().trim().min(1, "Write a caption first").max(200_000),
  checkId: z.enum(SCORE_CHECK_IDS),
  channelIds: z.array(z.string()).default([]),
});

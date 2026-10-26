import type { ComposedPost, MediaItem, ValidationIssue } from "@postline/core";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export interface ComposeInput {
  post: { id: string; captionOverride: string | null };
  group: { caption: string; options: unknown };
  channel: { network: string; extras: unknown };
  /** PostMedia rows (any order) with their MediaAsset. */
  media: Array<{
    position: number;
    media: {
      url: string;
      mime: string;
      width: number | null;
      height: number | null;
      sizeBytes: number | null;
      duration: number | null;
      alt: string | null;
    };
  }>;
}

/** Build the per-channel ComposedPost from PostGroup + Post + Channel + media. Pure. */
export function composePost(input: ComposeInput): ComposedPost {
  const { post, group, channel } = input;
  const caption = post.captionOverride ?? group.caption;
  const options = asRecord(asRecord(group.options)[channel.network]);
  const media: MediaItem[] = [...input.media]
    .sort((a, b) => a.position - b.position)
    .map(({ media: m }) => {
      const item: MediaItem = { url: m.url, mime: m.mime };
      if (m.width != null) item.width = m.width;
      if (m.height != null) item.height = m.height;
      if (m.sizeBytes != null) item.sizeBytes = m.sizeBytes;
      if (m.duration != null) item.durationSec = m.duration;
      if (m.alt != null) item.alt = m.alt;
      return item;
    });
  return { postId: post.id, caption, media, options, channelExtras: asRecord(channel.extras) };
}

export function blockingIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter((i) => i.level === "error");
}

/** Append hashtags that are not already present in the caption (case-insensitive). */
export function appendHashtags(caption: string, hashtags: string[] | undefined): string {
  if (!hashtags || hashtags.length === 0) return caption;
  const lower = caption.toLowerCase();
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const raw of hashtags) {
    const t = raw.trim().replace(/^#*/, "");
    if (!t) continue;
    const tag = `#${t}`;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // Whole-tag match: "#ai" must not count as present in "#aiart".
    const re = new RegExp(`${escapeRe(key)}(?![\\p{L}\\p{N}_])`, "u");
    if (re.test(lower)) continue;
    missing.push(tag);
  }
  if (missing.length === 0) return caption;
  const trimmed = caption.replace(/\s+$/, "");
  return trimmed ? `${trimmed}\n\n${missing.join(" ")}` : missing.join(" ");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// OWNED BY: integrations agent.
// Pure and browser-safe: no node imports. The editor calls this on every keystroke.
import type { ComposedPost, MediaItem, ValidationIssue } from "./adapter";
import { NETWORK_LABELS, NETWORK_LIMITS, type Network } from "./networks";
import { splitIntoThread } from "./thread";

const MB = 1024 * 1024;

/** Networks that do not allow images and videos in the same post. */
const MIXED_MEDIA_DISALLOWED: ReadonlySet<Network> = new Set<Network>([
  "X",
  "BLUESKY",
  "MASTODON",
  "LINKEDIN",
  "LINKEDIN_PAGE",
  "PINTEREST",
  "TIKTOK",
  "YOUTUBE",
  "GOOGLE_BUSINESS",
]);

/** Networks that count every URL as a fixed length (t.co / Mastodon both use 23). */
const URL_FIXED_LENGTH: Partial<Record<Network, number>> = { X: 23, MASTODON: 23 };

const URL_RE = /https?:\/\/[^\s<>"']+/giu;
const HASHTAG_RE = /(^|[^\p{L}\p{N}_&/])#([\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)/gu;
const EMOJI_RE = /\p{Extended_Pictographic}/u;

type Segmenter = { segment(input: string): Iterable<{ segment: string }> };
let segmenter: Segmenter | null | undefined;

function getSegmenter(): Segmenter | null {
  if (segmenter === undefined) {
    const Ctor = (Intl as unknown as { Segmenter?: new (locale?: string, opts?: { granularity: "grapheme" }) => Segmenter })
      .Segmenter;
    segmenter = Ctor ? new Ctor(undefined, { granularity: "grapheme" }) : null;
  }
  return segmenter;
}

/** Split text into user-perceived characters (grapheme clusters); falls back to code points. */
export function graphemes(text: string): string[] {
  const seg = getSegmenter();
  if (!seg) return [...text];
  const out: string[] = [];
  for (const s of seg.segment(text)) out.push(s.segment);
  return out;
}

/** twitter-text v3 weighting: these code point ranges weigh 1, everything else (CJK, emoji…) weighs 2. */
function xCodePointWeight(cp: number): number {
  if (cp <= 4351 || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247)) return 1;
  return 2;
}

function xGraphemeWeight(g: string): number {
  if (EMOJI_RE.test(g)) return 2;
  let w = 0;
  for (const ch of g) w += xCodePointWeight(ch.codePointAt(0) ?? 0);
  return w;
}

/** Count characters the way networks do (grapheme clusters; X & Mastodon count URLs as 23, X weighs CJK/emoji as 2). */
export function countCharacters(network: Network, text: string): number {
  if (!text) return 0;
  const urlLen = URL_FIXED_LENGTH[network];
  let body = text;
  let urlTotal = 0;
  if (urlLen !== undefined) {
    body = text.replace(URL_RE, () => {
      urlTotal += urlLen;
      return "";
    });
  }
  if (network === "X") {
    let n = 0;
    for (const g of graphemes(body.normalize("NFC"))) n += xGraphemeWeight(g);
    return n + urlTotal;
  }
  return graphemes(body).length + urlTotal;
}

/** Hashtags in a caption (without '#'). Ignores URL fragments and HTML entities. */
export function extractHashtags(text: string): string[] {
  const withoutUrls = text.replace(URL_RE, " ");
  const out: string[] = [];
  for (const m of withoutUrls.matchAll(HASHTAG_RE)) if (m[2]) out.push(m[2]);
  return out;
}

export function mediaKind(m: Pick<MediaItem, "mime">): "image" | "video" | "other" {
  const mime = (m.mime || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "other";
}

const fmtMb = (bytes: number) => `${Math.round((bytes / MB) * 10) / 10} MB`;

/**
 * Generic validation of a post against NETWORK_LIMITS (caption length / thread range, hashtags,
 * image & video counts, sizes, required media). Adapters call this and add network-specific checks.
 * Must be pure and browser-safe (the editor calls it on every keystroke).
 */
export function validateAgainstLimits(
  network: Network,
  post: Pick<ComposedPost, "caption" | "media" | "options">,
): ValidationIssue[] {
  const limits = NETWORK_LIMITS[network];
  const label = NETWORK_LABELS[network];
  const issues: ValidationIssue[] = [];
  const caption = post.caption ?? "";
  const media = post.media ?? [];

  if (!caption.trim() && media.length === 0) {
    issues.push({ level: "error", code: "empty", message: `${label} post needs text or media` });
    return issues;
  }

  // Caption length / threading
  const len = countCharacters(network, caption);
  if (limits.captionHard !== undefined) {
    if (len > limits.captionHard) {
      issues.push({
        level: "error",
        code: "caption_too_long",
        message: `${label} caption is ${len} characters; the maximum (even as a thread) is ${limits.captionHard}`,
      });
    } else if (len > limits.caption) {
      const parts = splitIntoThread(network, caption).length;
      issues.push({
        level: "warning",
        code: "will_thread",
        message: `${label} caption exceeds ${limits.caption} characters and will be split into a thread of ${parts} posts`,
      });
    }
  } else if (len > limits.caption) {
    issues.push({
      level: "error",
      code: "caption_too_long",
      message: `${label} caption is ${len} characters; the maximum is ${limits.caption}`,
    });
  }

  // Hashtags
  if (limits.hashtags !== undefined) {
    const n = extractHashtags(caption).length;
    if (n > limits.hashtags) {
      issues.push({
        level: "error",
        code: "too_many_hashtags",
        message: `${label} allows at most ${limits.hashtags} hashtags (found ${n})`,
      });
    }
  }

  // Media
  const images = media.filter((m) => mediaKind(m) === "image");
  const videos = media.filter((m) => mediaKind(m) === "video");
  const other = media.filter((m) => mediaKind(m) === "other");

  if (other.length > 0) {
    issues.push({
      level: "error",
      code: "unsupported_media",
      message: `${label} only accepts images and videos (${other.map((m) => m.mime || "unknown").join(", ")} not supported)`,
    });
  }
  if (images.length > limits.images) {
    issues.push({
      level: "error",
      code: "too_many_images",
      message:
        limits.images === 0
          ? `${label} does not support images`
          : `${label} allows at most ${limits.images} image${limits.images === 1 ? "" : "s"} (found ${images.length})`,
    });
  }
  if (videos.length > limits.videos) {
    issues.push({
      level: "error",
      code: "too_many_videos",
      message:
        limits.videos === 0
          ? `${label} does not support videos`
          : `${label} allows at most ${limits.videos} video${limits.videos === 1 ? "" : "s"} (found ${videos.length})`,
    });
  }
  if (images.length > 0 && videos.length > 0 && MIXED_MEDIA_DISALLOWED.has(network)) {
    issues.push({ level: "error", code: "mixed_media", message: `${label} can't mix images and videos in one post` });
  }
  if (limits.imageMaxBytes !== undefined) {
    for (const m of images) {
      if (m.sizeBytes !== undefined && m.sizeBytes > limits.imageMaxBytes) {
        issues.push({
          level: "error",
          code: "media_too_large",
          message: `${label} images must be at most ${fmtMb(limits.imageMaxBytes)} (one is ${fmtMb(m.sizeBytes)})`,
        });
      }
    }
  }
  if (limits.videoMaxBytes !== undefined) {
    for (const m of videos) {
      if (m.sizeBytes !== undefined && m.sizeBytes > limits.videoMaxBytes) {
        issues.push({
          level: "error",
          code: "media_too_large",
          message: `${label} videos must be at most ${fmtMb(limits.videoMaxBytes)} (one is ${fmtMb(m.sizeBytes)})`,
        });
      }
    }
  }
  if (limits.requiresMedia && media.length === 0) {
    issues.push({ level: "error", code: "media_required", message: `${label} posts require an image or video` });
  }

  return issues;
}

// Pure, browser-safe per-network validation rules. Imported by client.ts AND by the server adapters,
// so it must not import anything node-only (no adapters, no http, no SDKs).
import {
  TELEGRAM_MEDIA_CAPTION_LIMIT,
  countCharacters,
  mediaKind,
  validateAgainstLimits,
  type ComposedPost,
  type Network,
  type ValidationIssue,
} from "@postline/core";

export type PostDraft = Pick<ComposedPost, "caption" | "media" | "options">;
type ExtraRule = (post: PostDraft) => ValidationIssue[];

const hasVideo = (post: PostDraft) => post.media.some((m) => mediaKind(m) === "video");
const nonEmptyString = (v: unknown) => typeof v === "string" && v.trim().length > 0;

const firstLine = (s: string) => s.split("\n").find((l) => l.trim())?.trim() ?? "";

const EXTRA_RULES: Partial<Record<Network, ExtraRule>> = {
  // Pinterest: the board defaults to the connected account's first board, so no option is required.

  REDDIT: (post) => {
    const issues: ValidationIssue[] = [];
    const sub = typeof post.options.subreddit === "string" ? post.options.subreddit.replace(/^\/?r\//i, "").trim() : "";
    if (!sub) issues.push({ level: "error", code: "option_invalid", message: "Reddit needs a subreddit — set it in the Reddit options" });
    const title = nonEmptyString(post.options.title) ? String(post.options.title) : firstLine(post.caption);
    if (!title) issues.push({ level: "error", code: "option_invalid", message: "Reddit posts need a title — add a first line or set one in the Reddit options" });
    else if (title.length > 300) issues.push({ level: "error", code: "option_invalid", message: "Reddit titles are limited to 300 characters" });
    if (post.media.length) issues.push({ level: "warning", code: "unsupported_media", message: "Media isn't posted to Reddit — add a link in the Reddit options instead" });
    return issues;
  },

  TELEGRAM: (post) =>
    post.media.length > 0 && countCharacters("TELEGRAM", post.caption) > TELEGRAM_MEDIA_CAPTION_LIMIT
      ? [
          {
            level: "warning",
            code: "caption_too_long",
            message: `Telegram media captions are limited to ${TELEGRAM_MEDIA_CAPTION_LIMIT} characters; the text will be sent as a separate message after the media`,
          },
        ]
      : [],

  // TODO(linkedin-video): LinkedIn video upload (multi-part /rest/videos) is not implemented yet.
  LINKEDIN: (post) =>
    hasVideo(post)
      ? [{ level: "error", code: "unsupported_media", message: "LinkedIn video posts aren't supported yet — use images" }]
      : [],

  SLACK: (post) =>
    hasVideo(post)
      ? [{ level: "warning", code: "unsupported_media", message: "Slack webhooks can't embed videos; they will be posted as links" }]
      : [],

  INSTAGRAM: (post) =>
    post.media.length > 1 && post.media.some((m) => mediaKind(m) === "video" && (m.durationSec ?? 0) > 60)
      ? [{ level: "error", code: "unsupported_media", message: "Instagram carousel videos must be 60 seconds or shorter" }]
      : [],
};

/** Generic limits + network-specific checks. Pure and synchronous. */
export function validateForNetwork(network: Network, post: PostDraft): ValidationIssue[] {
  const normalized: PostDraft = { caption: post.caption ?? "", media: post.media ?? [], options: post.options ?? {} };
  const issues = validateAgainstLimits(network, normalized);
  if (issues.some((i) => i.code === "empty")) return issues;
  const extra = EXTRA_RULES[network];
  return extra ? [...issues, ...extra(normalized)] : issues;
}

export const hasBlockingIssues = (issues: ValidationIssue[]) => issues.some((i) => i.level === "error");

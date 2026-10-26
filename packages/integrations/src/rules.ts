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

const EXTRA_RULES: Partial<Record<Network, ExtraRule>> = {
  PINTEREST: (post) =>
    nonEmptyString(post.options.boardId)
      ? []
      : [{ level: "error", code: "option_invalid", message: "Pinterest needs a board — choose one in the Pinterest options" }],

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

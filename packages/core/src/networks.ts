/** Mirrors the Prisma `Network` enum. Kept as a string union so this package has no Prisma dependency. */
export const NETWORKS = [
  "FACEBOOK",
  "INSTAGRAM",
  "X",
  "LINKEDIN",
  "LINKEDIN_PAGE",
  "PINTEREST",
  "TIKTOK",
  "YOUTUBE",
  "THREADS",
  "BLUESKY",
  "MASTODON",
  "TELEGRAM",
  "DISCORD",
  "SLACK",
  "GOOGLE_BUSINESS",
  "CUSTOM_WEBHOOK",
] as const;
export type Network = (typeof NETWORKS)[number];

export interface NetworkLimits {
  /** Characters that fit in one post. */
  caption: number;
  /** If set, captions between `caption` and `captionHard` are split into a thread; above it the post is refused. */
  captionHard?: number;
  /** Max hashtags; undefined = no limit. */
  hashtags?: number;
  images: number;
  imageMaxBytes?: number;
  videos: number;
  videoMaxBytes?: number;
  /** Whether a post must carry media (e.g. Instagram, TikTok, Pinterest). */
  requiresMedia?: boolean;
}

const MB = 1024 * 1024;

export const NETWORK_LIMITS: Record<Network, NetworkLimits> = {
  FACEBOOK: { caption: 5000, images: 10, imageMaxBytes: 8 * MB, videos: 1, videoMaxBytes: 100 * MB },
  INSTAGRAM: { caption: 2200, hashtags: 30, images: 10, imageMaxBytes: 8 * MB, videos: 1, videoMaxBytes: 100 * MB, requiresMedia: true },
  X: { caption: 280, captionHard: 5000, images: 4, imageMaxBytes: 5 * MB, videos: 1, videoMaxBytes: 100 * MB },
  LINKEDIN: { caption: 3000, images: 9, imageMaxBytes: 10 * MB, videos: 1, videoMaxBytes: 100 * MB },
  LINKEDIN_PAGE: { caption: 3000, images: 9, imageMaxBytes: 10 * MB, videos: 1, videoMaxBytes: 100 * MB },
  PINTEREST: { caption: 500, images: 5, videos: 1, requiresMedia: true },
  TIKTOK: { caption: 2200, images: 35, imageMaxBytes: 20 * MB, videos: 1, videoMaxBytes: 100 * MB, requiresMedia: true },
  YOUTUBE: { caption: 5000, images: 0, videos: 1, requiresMedia: true },
  THREADS: { caption: 500, captionHard: 5000, images: 10, imageMaxBytes: 8 * MB, videos: 1, videoMaxBytes: 100 * MB },
  BLUESKY: { caption: 300, captionHard: 5000, images: 4, imageMaxBytes: 1_000_000, videos: 1, videoMaxBytes: 50 * MB },
  MASTODON: { caption: 500, captionHard: 5000, images: 4, imageMaxBytes: 16 * MB, videos: 1, videoMaxBytes: 40 * MB },
  TELEGRAM: { caption: 4096, images: 10, imageMaxBytes: 10 * MB, videos: 1, videoMaxBytes: 50 * MB },
  DISCORD: { caption: 2000, images: 10, imageMaxBytes: 10 * MB, videos: 1, videoMaxBytes: 25 * MB },
  SLACK: { caption: 40000, images: 10, imageMaxBytes: 100 * MB, videos: 1, videoMaxBytes: 100 * MB },
  GOOGLE_BUSINESS: { caption: 1500, images: 1, imageMaxBytes: 5 * MB, videos: 0 },
  CUSTOM_WEBHOOK: { caption: 200000, images: 20, videos: 1 },
};

/** Telegram captions on media are limited to 1024; plain text messages 4096. */
export const TELEGRAM_MEDIA_CAPTION_LIMIT = 1024;

export const NETWORK_LABELS: Record<Network, string> = {
  FACEBOOK: "Facebook Page",
  INSTAGRAM: "Instagram",
  X: "X (Twitter)",
  LINKEDIN: "LinkedIn",
  LINKEDIN_PAGE: "LinkedIn Page",
  PINTEREST: "Pinterest",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube Shorts",
  THREADS: "Threads",
  BLUESKY: "Bluesky",
  MASTODON: "Mastodon",
  TELEGRAM: "Telegram",
  DISCORD: "Discord",
  SLACK: "Slack",
  GOOGLE_BUSINESS: "Google Business",
  CUSTOM_WEBHOOK: "Custom webhook",
};

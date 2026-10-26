"use client";

import {
  IconBrandNotion,
  IconBrandReddit,
  IconBrandBluesky,
  IconBrandDiscord,
  IconBrandFacebook,
  IconBrandGoogle,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandMastodon,
  IconBrandPinterest,
  IconBrandSlack,
  IconBrandTelegram,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutube,
  IconWebhook,
  type Icon,
} from "@tabler/icons-react";
import type { Network } from "@postline/core";

export const NETWORK_ICONS: Record<Network, Icon> = {
  FACEBOOK: IconBrandFacebook,
  INSTAGRAM: IconBrandInstagram,
  X: IconBrandX,
  LINKEDIN: IconBrandLinkedin,
  LINKEDIN_PAGE: IconBrandLinkedin,
  PINTEREST: IconBrandPinterest,
  TIKTOK: IconBrandTiktok,
  YOUTUBE: IconBrandYoutube,
  THREADS: IconBrandThreads,
  BLUESKY: IconBrandBluesky,
  MASTODON: IconBrandMastodon,
  TELEGRAM: IconBrandTelegram,
  DISCORD: IconBrandDiscord,
  SLACK: IconBrandSlack,
  GOOGLE_BUSINESS: IconBrandGoogle,
  CUSTOM_WEBHOOK: IconWebhook,
  REDDIT: IconBrandReddit,
  NOTION: IconBrandNotion,
};

export const NETWORK_COLORS: Record<Network, string> = {
  FACEBOOK: "#1877F2",
  INSTAGRAM: "#E1306C",
  X: "#14171A",
  LINKEDIN: "#0A66C2",
  LINKEDIN_PAGE: "#0A66C2",
  PINTEREST: "#E60023",
  TIKTOK: "#111111",
  YOUTUBE: "#FF0000",
  THREADS: "#111111",
  BLUESKY: "#0085FF",
  MASTODON: "#6364FF",
  TELEGRAM: "#26A5E4",
  DISCORD: "#5865F2",
  SLACK: "#4A154B",
  GOOGLE_BUSINESS: "#4285F4",
  CUSTOM_WEBHOOK: "#868E96",
  REDDIT: "#FF4500",
  NOTION: "#191919",
};

export function NetworkIcon({ network, size = 16, color }: { network: Network; size?: number; color?: string }) {
  const I = NETWORK_ICONS[network] ?? IconWebhook;
  return <I size={size} color={color} stroke={1.8} aria-hidden />;
}

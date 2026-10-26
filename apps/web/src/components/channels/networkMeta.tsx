import type { ComponentType } from "react";
import {
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
  type IconProps,
} from "@tabler/icons-react";
import { NETWORK_LABELS, type Network } from "@postline/core";

export const NETWORK_META: Record<Network, { label: string; color: string; Icon: ComponentType<IconProps> }> = {
  FACEBOOK: { label: NETWORK_LABELS.FACEBOOK, color: "#1877F2", Icon: IconBrandFacebook },
  INSTAGRAM: { label: NETWORK_LABELS.INSTAGRAM, color: "#E1306C", Icon: IconBrandInstagram },
  X: { label: NETWORK_LABELS.X, color: "#111111", Icon: IconBrandX },
  LINKEDIN: { label: NETWORK_LABELS.LINKEDIN, color: "#0A66C2", Icon: IconBrandLinkedin },
  LINKEDIN_PAGE: { label: NETWORK_LABELS.LINKEDIN_PAGE, color: "#0A66C2", Icon: IconBrandLinkedin },
  PINTEREST: { label: NETWORK_LABELS.PINTEREST, color: "#E60023", Icon: IconBrandPinterest },
  TIKTOK: { label: NETWORK_LABELS.TIKTOK, color: "#010101", Icon: IconBrandTiktok },
  YOUTUBE: { label: NETWORK_LABELS.YOUTUBE, color: "#FF0000", Icon: IconBrandYoutube },
  THREADS: { label: NETWORK_LABELS.THREADS, color: "#000000", Icon: IconBrandThreads },
  BLUESKY: { label: NETWORK_LABELS.BLUESKY, color: "#1185FE", Icon: IconBrandBluesky },
  MASTODON: { label: NETWORK_LABELS.MASTODON, color: "#6364FF", Icon: IconBrandMastodon },
  TELEGRAM: { label: NETWORK_LABELS.TELEGRAM, color: "#26A5E4", Icon: IconBrandTelegram },
  DISCORD: { label: NETWORK_LABELS.DISCORD, color: "#5865F2", Icon: IconBrandDiscord },
  SLACK: { label: NETWORK_LABELS.SLACK, color: "#4A154B", Icon: IconBrandSlack },
  GOOGLE_BUSINESS: { label: NETWORK_LABELS.GOOGLE_BUSINESS, color: "#4285F4", Icon: IconBrandGoogle },
  CUSTOM_WEBHOOK: { label: NETWORK_LABELS.CUSTOM_WEBHOOK, color: "#868E96", Icon: IconWebhook },
};

/** Round network badge (brand color background, white glyph). */
export function NetworkIcon({ network, size = 28 }: { network: Network; size?: number }) {
  const { color, Icon } = NETWORK_META[network];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        flexShrink: 0,
      }}
    >
      <Icon size={size * 0.6} stroke={1.8} />
    </span>
  );
}

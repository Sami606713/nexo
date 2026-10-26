"use client";
// OWNED BY: inbox agent.
import { Avatar, Box } from "@mantine/core";
import type { Network } from "@postline/core";
import { NetworkIcon } from "@/components/channels/networkMeta";
import type { ConversationKind } from "./types";

export const KIND_TABS: { value: ConversationKind; label: string }[] = [
  { value: "DM", label: "DMs" },
  { value: "MENTION", label: "Mentions" },
  { value: "COMMENT", label: "Comments" },
];

export const KIND_NOUN: Record<ConversationKind, string> = { DM: "message", MENTION: "mention", COMMENT: "comment" };

export const initials = (s: string) =>
  s
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** "now", "5m", "3h", "2d", or a short date. */
export function shortTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fullTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Avatar with a small network badge in the corner. */
export function PersonAvatar({ src, name, network, size = 40 }: { src: string | null; name: string; network: Network; size?: number }) {
  const badge = Math.max(14, Math.round(size * 0.42));
  return (
    <Box pos="relative" style={{ flexShrink: 0, width: size, height: size }}>
      <Avatar src={src} radius="xl" size={size} color="initials" name={name}>
        {initials(name)}
      </Avatar>
      <Box
        pos="absolute"
        style={{ right: -3, bottom: -3, borderRadius: "50%", border: "2px solid var(--mantine-color-body)", lineHeight: 0 }}
      >
        <NetworkIcon network={network} size={badge} />
      </Box>
    </Box>
  );
}

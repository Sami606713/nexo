"use client";

import { Avatar, Box, Tooltip } from "@mantine/core";
import { NETWORK_LABELS, type Network } from "@postline/core";
import { NETWORK_COLORS, NetworkIcon } from "./NetworkIcon";

interface Props {
  channel: { network: Network; name: string; avatarUrl: string | null; username?: string | null };
  size?: number;
  tooltip?: boolean;
  dimmed?: boolean;
}

/** Channel avatar with a small network badge in the corner. */
export function ChannelAvatar({ channel, size = 32, tooltip = true, dimmed }: Props) {
  const badge = Math.max(12, Math.round(size * 0.45));
  const node = (
    <Box pos="relative" w={size} h={size} style={{ flexShrink: 0, opacity: dimmed ? 0.45 : 1 }}>
      <Avatar src={channel.avatarUrl} alt={channel.name} size={size} radius="xl" color="gray">
        {channel.name.slice(0, 2).toUpperCase()}
      </Avatar>
      <Box
        pos="absolute"
        right={-2}
        bottom={-2}
        w={badge}
        h={badge}
        style={{
          borderRadius: "50%",
          background: NETWORK_COLORS[channel.network],
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "2px solid var(--mantine-color-body)",
        }}
      >
        <NetworkIcon network={channel.network} size={badge - 5} color="white" />
      </Box>
    </Box>
  );
  if (!tooltip) return node;
  return (
    <Tooltip label={`${channel.name} · ${NETWORK_LABELS[channel.network]}`} withArrow>
      {node}
    </Tooltip>
  );
}

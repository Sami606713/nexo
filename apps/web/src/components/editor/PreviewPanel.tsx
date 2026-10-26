"use client";

import { useState } from "react";
import { Anchor, Avatar, Box, Group, Image, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconHeart, IconMessageCircle, IconRepeat, IconShare3 } from "@tabler/icons-react";
import { NETWORK_LABELS } from "@postline/core";
import type { ChannelDTO, MediaDTO } from "@/lib/posts/types";
import { NetworkIcon } from "@/components/posts/NetworkIcon";

const TRUNCATE_AT = 220;

function Caption({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > TRUNCATE_AT;
  const shown = long && !expanded ? `${text.slice(0, TRUNCATE_AT).trimEnd()}…` : text;
  return (
    <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {shown || (
        <Text span c="dimmed" fs="italic">
          Your caption will appear here
        </Text>
      )}
      {long && (
        <Anchor component="button" type="button" size="sm" ml={4} onClick={() => setExpanded((e) => !e)}>
          {expanded ? "see less" : "see more"}
        </Anchor>
      )}
    </Text>
  );
}

function MediaGrid({ media }: { media: MediaDTO[] }) {
  if (!media.length) return null;
  const shown = media.slice(0, 4);
  const cols = shown.length === 1 ? 1 : 2;
  return (
    <SimpleGrid cols={cols} spacing={2} style={{ borderRadius: 8, overflow: "hidden" }}>
      {shown.map((m, i) => (
        <Box key={m.id} pos="relative" style={{ aspectRatio: shown.length === 1 ? undefined : "1 / 1" }}>
          {m.mime.startsWith("video/") ? (
            <video src={m.url} controls muted style={{ width: "100%", height: "100%", objectFit: "cover", background: "black" }} />
          ) : (
            <Image src={m.url} alt={m.alt ?? ""} h="100%" fit="cover" mah={shown.length === 1 ? 360 : undefined} />
          )}
          {i === 3 && media.length > 4 && (
            <Box pos="absolute" inset={0} bg="rgba(0,0,0,.55)" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Text c="white" fw={700} size="lg">
                +{media.length - 4}
              </Text>
            </Box>
          )}
        </Box>
      ))}
    </SimpleGrid>
  );
}

export function PreviewCard({ channel, caption, media }: { channel: ChannelDTO; caption: string; media: MediaDTO[] }) {
  const mediaFirst = ["INSTAGRAM", "PINTEREST", "TIKTOK", "YOUTUBE"].includes(channel.network);
  return (
    <Paper withBorder radius="md" p="sm">
      <Stack gap="xs">
        <Group gap="xs" wrap="nowrap">
          <Avatar src={channel.avatarUrl} size={36} radius="xl">
            {channel.name.slice(0, 2).toUpperCase()}
          </Avatar>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" fw={600} truncate>
              {channel.name}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {channel.username ? `@${channel.username} · ` : ""}Just now
            </Text>
          </Box>
          <NetworkIcon network={channel.network} size={18} />
        </Group>
        {mediaFirst ? (
          <>
            <MediaGrid media={media} />
            <Caption text={caption} />
          </>
        ) : (
          <>
            <Caption text={caption} />
            <MediaGrid media={media} />
          </>
        )}
        <Group gap="lg" c="dimmed" aria-hidden>
          <IconHeart size={16} />
          <IconMessageCircle size={16} />
          <IconRepeat size={16} />
          <IconShare3 size={16} />
        </Group>
      </Stack>
    </Paper>
  );
}

export function PreviewPanel({ channels, captionFor, media }: { channels: ChannelDTO[]; captionFor: (id: string) => string; media: MediaDTO[] }) {
  if (!channels.length) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="xl">
        Select a channel to see a preview.
      </Text>
    );
  }
  return (
    <Stack gap="md">
      {channels.map((c) => (
        <Stack key={c.id} gap={4}>
          <Text size="xs" c="dimmed" fw={600} tt="uppercase">
            {NETWORK_LABELS[c.network]}
          </Text>
          <PreviewCard channel={c} caption={captionFor(c.id)} media={media} />
        </Stack>
      ))}
    </Stack>
  );
}

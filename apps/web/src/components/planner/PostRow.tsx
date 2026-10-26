"use client";

import Link from "next/link";
import { ActionIcon, Anchor, Avatar, Badge, Box, Group, Image, Paper, Stack, Text, Tooltip } from "@mantine/core";
import { IconAlertTriangle, IconExternalLink, IconRefresh, IconVideo } from "@tabler/icons-react";
import type { PostGroupDTO } from "@/lib/posts/types";
import { ChannelAvatar } from "@/components/posts/ChannelAvatar";
import { StatusBadge } from "@/components/posts/StatusBadge";
import { excerpt } from "@/components/posts/utils";
import { formatTime } from "@/components/posts/tz";
import { canRetry } from "./shared";

export function ChannelStack({ group, size = 24 }: { group: PostGroupDTO; size?: number }) {
  const shown = group.posts.slice(0, 4);
  return (
    <Group gap={4} wrap="nowrap">
      {shown.map((p) => (
        <ChannelAvatar key={p.id} channel={p.channel} size={size} />
      ))}
      {group.posts.length > 4 && (
        <Avatar size={size} radius="xl">
          +{group.posts.length - 4}
        </Avatar>
      )}
    </Group>
  );
}

export function ErrorTooltip({ group }: { group: PostGroupDTO }) {
  if (group.status !== "ERROR" && group.status !== "NEEDS_ATTENTION") return null;
  return (
    <Tooltip
      withArrow
      multiline
      maw={320}
      events={{ hover: true, focus: true, touch: true }}
      label={
        <Stack gap={4}>
          {group.posts.map((p) => (
            <Text key={p.id} size="xs">
              <b>{p.channel.name}:</b> {p.status === "POSTED" ? "posted" : (p.error?.message ?? p.status.toLowerCase())}
            </Text>
          ))}
        </Stack>
      }
    >
      <ActionIcon variant="subtle" color={group.status === "ERROR" ? "red" : "orange"} size="sm" aria-label="Show publishing errors">
        <IconAlertTriangle size={16} />
      </ActionIcon>
    </Tooltip>
  );
}

export function PostThumb({ group, size = 48 }: { group: PostGroupDTO; size?: number }) {
  const m = group.media[0];
  if (!m) return null;
  return m.mime.startsWith("video/") ? (
    <Box w={size} h={size} bg="dark" style={{ borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <IconVideo size={18} color="white" />
    </Box>
  ) : (
    <Image src={m.url} alt={m.alt ?? ""} w={size} h={size} radius="sm" fit="cover" style={{ flexShrink: 0 }} />
  );
}

export function PostRow({ brandId, group, timezone, onRetry }: { brandId: string; group: PostGroupDTO; timezone: string; onRetry?: (g: PostGroupDTO) => void }) {
  const href = `/app/${brandId}/posts/${group.id}`;
  const links = group.posts.filter((p) => p.url);
  return (
    <Paper withBorder radius="md" p="sm">
      <Group wrap="nowrap" gap="sm" align="center">
        <Text size="sm" fw={600} w={72} style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }} c={group.scheduledAt ? undefined : "dimmed"}>
          {group.scheduledAt ? formatTime(group.scheduledAt, timezone) : "—"}
        </Text>
        <Box visibleFrom="xs">
          <ChannelStack group={group} />
        </Box>
        <Anchor component={Link} href={href} underline="never" c="inherit" style={{ flex: 1, minWidth: 0 }}>
          <Stack gap={4}>
            <Text size="sm" lineClamp={2}>
              {group.caption.trim() ? excerpt(group.caption, 220) : <Text span c="dimmed" fs="italic">No caption yet</Text>}
            </Text>
            {group.labels.length > 0 && (
              <Group gap={4}>
                {group.labels.map((l) => (
                  <Badge key={l.id} size="xs" variant="light" color={l.color}>
                    {l.name}
                  </Badge>
                ))}
              </Group>
            )}
          </Stack>
        </Anchor>
        <PostThumb group={group} />
        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
          {links.map((p) => (
            <Tooltip key={p.id} label={`Open on ${p.channel.name}`}>
              <ActionIcon component="a" href={p.url!} target="_blank" rel="noreferrer" variant="subtle" size="sm" aria-label={`Open on ${p.channel.name}`}>
                <IconExternalLink size={14} />
              </ActionIcon>
            </Tooltip>
          ))}
          <ErrorTooltip group={group} />
          {onRetry && canRetry(group) && (
            <Tooltip label="Retry failed channels">
              <ActionIcon variant="light" color="red" size="sm" aria-label="Retry failed channels" onClick={() => onRetry(group)}>
                <IconRefresh size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          <StatusBadge status={group.status} />
        </Group>
      </Group>
    </Paper>
  );
}

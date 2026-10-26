"use client";

import { Alert, Anchor, Button, Group, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconClockHour4, IconExternalLink, IconLock, IconRefresh, IconUserCheck } from "@tabler/icons-react";
import type { PostGroupDetailDTO } from "@/lib/posts/types";
import { ChannelAvatar } from "@/components/posts/ChannelAvatar";
import { useMembers } from "@/components/posts/utils";

export function StatusBanners({
  brandId,
  group,
  onRetry,
  retrying,
}: {
  brandId: string;
  group: PostGroupDetailDTO;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { members } = useMembers(brandId);
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.name ?? "a teammate";
  const failed = group.posts.filter((p) => p.status === "ERROR" || p.error);
  const published = group.posts.filter((p) => p.url);

  return (
    <Stack gap="sm">
      {group.status === "PUBLISHING" && (
        <Alert color="cyan" icon={<IconClockHour4 size={18} />} title="Publishing…">
          Posts lock while publishing or after publishing.
        </Alert>
      )}
      {(group.status === "POSTED" || group.status === "NEEDS_ATTENTION") && (
        <Alert color={group.status === "POSTED" ? "green" : "orange"} icon={<IconLock size={18} />} title={group.status === "POSTED" ? "Published" : "Partly published"}>
          <Text size="sm">Posts lock while publishing or after publishing. Duplicate this post to reuse it.</Text>
        </Alert>
      )}
      {group.status === "PENDING_APPROVAL" && group.approval && (
        <Alert color="yellow" icon={<IconUserCheck size={18} />} title="Waiting for approval">
          <Text size="sm">
            {group.viewer.canDecide
              ? "You've been asked to approve this post."
              : `Waiting on ${group.approval.approverIds.map(nameOf).join(", ")}.`}
            {group.approval.comment ? ` “${group.approval.comment}”` : ""}
          </Text>
        </Alert>
      )}
      {group.approval?.decision === "rejected" && group.status === "DRAFT" && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title="Rejected">
          <Text size="sm">
            This post has been rejected and moved back to draft.
            {group.approval.comment ? ` “${group.approval.comment}”` : ""}
          </Text>
        </Alert>
      )}
      {(group.status === "ERROR" || group.status === "NEEDS_ATTENTION") && onRetry && group.posts.some((p) => p.status === "ERROR") && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title="Some channels failed to publish">
          <Group justify="space-between" gap="sm">
            <Text size="sm">Fix the issue (e.g. reconnect the channel), then retry. Channels that already posted won&apos;t be posted again.</Text>
            <Button size="xs" color="red" leftSection={<IconRefresh size={14} />} loading={retrying} onClick={onRetry}>
              Retry failed channels
            </Button>
          </Group>
        </Alert>
      )}
      {(published.length > 0 || failed.length > 0) && (
        <Stack gap={6}>
          {published.map((p) => (
            <Group key={p.id} gap="xs">
              <ChannelAvatar channel={p.channel} size={20} />
              <Anchor href={p.url!} target="_blank" rel="noreferrer" size="sm">
                View on {p.channel.name} <IconExternalLink size={12} />
              </Anchor>
            </Group>
          ))}
          {failed.map((p) => (
            <Group key={p.id} gap="xs" wrap="nowrap" align="flex-start">
              <ChannelAvatar channel={p.channel} size={20} />
              <Text size="sm" c="red">
                {p.channel.name}: {p.error?.message ?? "Publishing failed"}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

"use client";

import Link from "next/link";
import useSWR from "swr";
import { ActionIcon, Badge, Box, Group, Paper, ScrollArea, Skeleton, Stack, Text, Tooltip } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import type { PostStatus } from "@postline/core";
import type { PostGroupDTO } from "@/lib/posts/types";
import { STATUS_COLORS, excerpt } from "@/components/posts/utils";
import { formatDateTime } from "@/components/posts/tz";
import { ChannelStack, ErrorTooltip, PostThumb } from "./PostRow";
import { canRetry, postsKey, useRetry, type PlannerFilters } from "./shared";

const COLUMNS: { id: string; title: string; statuses: PostStatus[]; color: string }[] = [
  { id: "draft", title: "Draft", statuses: ["DRAFT", "GENERATING"], color: STATUS_COLORS.DRAFT },
  { id: "pending", title: "Pending approval", statuses: ["PENDING_APPROVAL"], color: STATUS_COLORS.PENDING_APPROVAL },
  { id: "scheduled", title: "Scheduled", statuses: ["SCHEDULED", "PUBLISHING"], color: STATUS_COLORS.SCHEDULED },
  { id: "posted", title: "Posted", statuses: ["POSTED"], color: STATUS_COLORS.POSTED },
  { id: "attention", title: "Needs attention", statuses: ["NEEDS_ATTENTION"], color: STATUS_COLORS.NEEDS_ATTENTION },
  { id: "error", title: "Error", statuses: ["ERROR"], color: STATUS_COLORS.ERROR },
];

export function BoardView({ brandId, timezone, filters, canWrite }: { brandId: string; timezone: string; filters: PlannerFilters; canWrite: boolean }) {
  const { data, isLoading } = useSWR<PostGroupDTO[]>(postsKey(brandId, filters, { order: "desc", limit: "500" }), { refreshInterval: 15_000 });
  const retry = useRetry(brandId);

  return (
    <ScrollArea type="auto" offsetScrollbars>
      <Group align="flex-start" wrap="nowrap" gap="sm" pb="sm">
        {COLUMNS.map((col) => {
          const items = (data ?? []).filter((g) => col.statuses.includes(g.status));
          return (
            <Paper key={col.id} withBorder radius="md" p="xs" w={280} miw={260} bg="var(--mantine-color-default-hover)" style={{ flexShrink: 0 }}>
              <Group justify="space-between" mb="xs" px={4}>
                <Group gap={6}>
                  <Box w={8} h={8} style={{ borderRadius: 4, background: `var(--mantine-color-${col.color}-filled)` }} />
                  <Text size="sm" fw={600}>
                    {col.title}
                  </Text>
                </Group>
                <Badge size="sm" variant="light" color={col.color} aria-label={`${items.length} posts`}>
                  {isLoading ? "…" : items.length}
                </Badge>
              </Group>
              <Stack gap="xs" mih={80}>
                {isLoading && <Skeleton h={90} radius="md" />}
                {items.map((g) => (
                  <Paper key={g.id} withBorder radius="md" p="xs" component={Link} href={`/app/${brandId}/posts/${g.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <Stack gap={6}>
                      <Group justify="space-between" wrap="nowrap">
                        <ChannelStack group={g} size={20} />
                        <Group gap={2} wrap="nowrap" onClick={(e) => e.preventDefault()}>
                          <ErrorTooltip group={g} />
                          {canWrite && canRetry(g) && (
                            <Tooltip label="Retry failed channels">
                              <ActionIcon size="sm" variant="light" color="red" aria-label="Retry failed channels" onClick={() => retry(g)}>
                                <IconRefresh size={14} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </Group>
                      </Group>
                      <Group wrap="nowrap" gap="xs" align="flex-start">
                        <Text size="sm" lineClamp={3} style={{ flex: 1 }}>
                          {g.caption.trim() ? excerpt(g.caption, 160) : <Text span c="dimmed" fs="italic">No caption yet</Text>}
                        </Text>
                        <PostThumb group={g} size={40} />
                      </Group>
                      <Text size="xs" c="dimmed">
                        {g.scheduledAt ? formatDateTime(g.scheduledAt, timezone) : "Not scheduled"}
                      </Text>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Paper>
          );
        })}
      </Group>
    </ScrollArea>
  );
}

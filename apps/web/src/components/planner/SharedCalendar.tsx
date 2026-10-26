"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { ActionIcon, Alert, Anchor, Box, Button, Group, Image, Modal, Paper, SimpleGrid, Skeleton, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { IconChevronLeft, IconChevronRight, IconExternalLink } from "@tabler/icons-react";
import type { SharedCalendarDTO, SharedCalendarPostDTO } from "@/lib/posts/types";
import { ChannelAvatar } from "@/components/posts/ChannelAvatar";
import { NETWORK_COLORS, NetworkIcon } from "@/components/posts/NetworkIcon";
import { StatusBadge } from "@/components/posts/StatusBadge";
import { STATUS_COLORS, excerpt } from "@/components/posts/utils";
import { dayjs, dayKey, formatDateTime, formatTime } from "@/components/posts/tz";
import { gridDays, weekdayLabels } from "./calendarGrid";

/** Public read-only month calendar for /share/calendar/[token]. */
export function SharedCalendar({ token }: { token: string }) {
  const [anchor, setAnchor] = useState(() => dayjs().format("YYYY-MM-DD"));
  const [open, setOpen] = useState<SharedCalendarPostDTO | null>(null);

  // First request uses the browser TZ for the window; brand TZ arrives with the data.
  const { data: meta } = useSWR<SharedCalendarDTO>(`/api/share/calendar/${token}`);
  const tz = meta?.brand.timezone ?? "UTC";
  const weekStart = meta?.brand.weekStart ?? 1;
  const days = useMemo(() => gridDays(anchor, "month", tz, weekStart), [anchor, tz, weekStart]);
  const from = days[0]!.toISOString();
  const to = days[days.length - 1]!.add(1, "day").toISOString();
  const { data, error, isLoading } = useSWR<SharedCalendarDTO>(meta ? `/api/share/calendar/${token}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : null);

  const byDay = useMemo(() => {
    const m = new Map<string, SharedCalendarPostDTO[]>();
    for (const p of data?.posts ?? []) {
      const k = dayKey(p.scheduledAt, tz);
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [data, tz]);

  if (error) {
    return (
      <Box p="xl" maw={520} mx="auto">
        <Alert color="red" title="Calendar unavailable">
          {error.message}
        </Alert>
      </Box>
    );
  }

  const anchorD = dayjs.tz(`${anchor} 00:00:00`, tz);
  const today = dayjs().tz(tz).format("YYYY-MM-DD");

  return (
    <Stack p={{ base: "sm", sm: "lg" }} maw={1200} mx="auto" gap="md">
      <Group justify="space-between" wrap="wrap">
        <div>
          <Title order={2}>{meta?.brand.name ?? <Skeleton h={28} w={200} />}</Title>
          <Text size="sm" c="dimmed">
            Content calendar · times in {tz}
          </Text>
        </div>
        <Group gap="xs">
          <ActionIcon variant="default" aria-label="Previous month" onClick={() => setAnchor(anchorD.subtract(1, "month").format("YYYY-MM-DD"))}>
            <IconChevronLeft size={16} />
          </ActionIcon>
          <Text fw={600} w={150} ta="center">
            {anchorD.format("MMMM YYYY")}
          </Text>
          <ActionIcon variant="default" aria-label="Next month" onClick={() => setAnchor(anchorD.add(1, "month").format("YYYY-MM-DD"))}>
            <IconChevronRight size={16} />
          </ActionIcon>
          <Button size="xs" variant="default" onClick={() => setAnchor(today)}>
            Today
          </Button>
        </Group>
      </Group>

      <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
        <Box style={{ overflowX: "auto" }}>
          <Box miw={700}>
            <SimpleGrid cols={7} spacing={0} style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
              {weekdayLabels(weekStart).map((d) => (
                <Text key={d} size="xs" fw={700} c="dimmed" ta="center" py={6} tt="uppercase">
                  {d}
                </Text>
              ))}
            </SimpleGrid>
            {isLoading || !data ? (
              <Skeleton h={560} radius={0} />
            ) : (
              <SimpleGrid cols={7} spacing={0}>
                {days.map((d) => {
                  const k = d.format("YYYY-MM-DD");
                  const posts = byDay.get(k) ?? [];
                  return (
                    <Box
                      key={k}
                      p={4}
                      mih={110}
                      style={{
                        borderRight: "1px solid var(--mantine-color-default-border)",
                        borderBottom: "1px solid var(--mantine-color-default-border)",
                        opacity: d.month() === anchorD.month() ? 1 : 0.5,
                        minWidth: 0,
                      }}
                    >
                      <Text size="xs" fw={k === today ? 800 : 500} c={k === today ? "indigo" : undefined} mb={4}>
                        {d.date()}
                      </Text>
                      <Stack gap={3}>
                        {posts.map((p) => {
                          const net = p.channels[0]?.network;
                          return (
                            <UnstyledButton key={p.id} onClick={() => setOpen(p)} aria-label={`Open post: ${excerpt(p.caption, 60)}`}>
                              <Paper
                                withBorder
                                radius="sm"
                                px={6}
                                py={2}
                                style={{ display: "flex", gap: 4, alignItems: "center", borderLeft: `3px solid var(--mantine-color-${STATUS_COLORS[p.status]}-filled)` }}
                              >
                                {net && <NetworkIcon network={net} size={12} color={NETWORK_COLORS[net]} />}
                                <Text size="xs" fw={600} style={{ flexShrink: 0 }}>
                                  {formatTime(p.scheduledAt, tz)}
                                </Text>
                                <Text size="xs" truncate>
                                  {excerpt(p.caption, 50)}
                                </Text>
                              </Paper>
                            </UnstyledButton>
                          );
                        })}
                      </Stack>
                    </Box>
                  );
                })}
              </SimpleGrid>
            )}
          </Box>
        </Box>
      </Paper>

      <Modal opened={!!open} onClose={() => setOpen(null)} title={open ? formatDateTime(open.scheduledAt, tz) : ""} size="lg">
        {open && (
          <Stack gap="sm">
            <Group gap="xs">
              <StatusBadge status={open.status} />
              {open.channels.map((c, i) => (
                <ChannelAvatar key={i} channel={c} size={24} />
              ))}
            </Group>
            {open.thumbUrl && <Image src={open.thumbUrl} alt="" radius="md" mah={360} fit="contain" />}
            <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {open.caption}
            </Text>
            {open.channels
              .filter((c) => c.url)
              .map((c, i) => (
                <Anchor key={i} href={c.url!} target="_blank" rel="noreferrer" size="sm">
                  View on {c.name} <IconExternalLink size={12} />
                </Anchor>
              ))}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

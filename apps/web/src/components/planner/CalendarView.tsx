"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ActionIcon, Box, Button, Group, Paper, SegmentedControl, SimpleGrid, Skeleton, Stack, Text, Title, Tooltip, UnstyledButton } from "@mantine/core";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@tabler/icons-react";
import { MIN_SCHEDULE_LEAD_MS } from "@postline/core";
import type { PostGroupDTO } from "@/lib/posts/types";
import { api } from "@/lib/fetcher";
import { NETWORK_COLORS, NetworkIcon } from "@/components/posts/NetworkIcon";
import { STATUS_COLORS, excerpt, isLockedStatus, notifyError, notifyOk } from "@/components/posts/utils";
import { dayjs, dayKey, formatTime, moveToDay } from "@/components/posts/tz";
import { gridDays, weekdayLabels } from "./calendarGrid";
import { postsKey, type PlannerFilters } from "./shared";

interface Props {
  brandId: string;
  timezone: string;
  weekStart: number;
  filters: PlannerFilters;
  canWrite: boolean;
}

function Chip({ brandId, g, timezone, draggable }: { brandId: string; g: PostGroupDTO; timezone: string; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: g.id, disabled: !draggable });
  const net = g.posts[0]?.channel.network;
  return (
    <Box
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      style={{
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        zIndex: isDragging ? 20 : undefined,
        opacity: isDragging ? 0.85 : 1,
        cursor: draggable ? "grab" : "pointer",
        touchAction: draggable ? "none" : undefined,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <Tooltip label={excerpt(g.caption, 200) || "No caption"} multiline maw={280} openDelay={400} withArrow>
        <Paper
          component={Link}
          href={`/app/${brandId}/posts/${g.id}`}
          radius="sm"
          px={6}
          py={2}
          withBorder
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            textDecoration: "none",
            color: "inherit",
            borderLeft: `3px solid var(--mantine-color-${STATUS_COLORS[g.status]}-filled)`,
            boxShadow: isDragging ? "var(--mantine-shadow-md)" : undefined,
          }}
        >
          {net && <NetworkIcon network={net} size={12} color={NETWORK_COLORS[net]} />}
          {g.posts.length > 1 && (
            <Text size="10px" c="dimmed">
              +{g.posts.length - 1}
            </Text>
          )}
          <Text size="xs" fw={600} style={{ flexShrink: 0 }}>
            {g.scheduledAt ? formatTime(g.scheduledAt, timezone) : ""}
          </Text>
          <Text size="xs" truncate style={{ minWidth: 0 }}>
            {excerpt(g.caption, 60)}
          </Text>
        </Paper>
      </Tooltip>
    </Box>
  );
}

function DayCell({
  day,
  inMonth,
  isToday,
  isPast,
  posts,
  children,
  onCreate,
  tall,
}: {
  day: string;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  posts: number;
  children: React.ReactNode;
  onCreate?: () => void;
  tall: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day, disabled: isPast });
  return (
    <Box
      ref={setNodeRef}
      onClick={onCreate}
      p={4}
      mih={tall ? 360 : 110}
      style={{
        borderRight: "1px solid var(--mantine-color-default-border)",
        borderBottom: "1px solid var(--mantine-color-default-border)",
        background: isOver ? "var(--mantine-primary-color-light)" : isPast ? "var(--mantine-color-default-hover)" : undefined,
        opacity: inMonth ? 1 : 0.55,
        cursor: onCreate ? "pointer" : "default",
        minWidth: 0,
        position: "relative",
      }}
      aria-label={`${dayjs(day).format("dddd, MMMM D")}: ${posts} post${posts === 1 ? "" : "s"}`}
    >
      <Group justify="space-between" mb={4} gap={2}>
        <Text
          size="xs"
          fw={isToday ? 700 : 500}
          c={isToday ? "white" : undefined}
          bg={isToday ? "var(--mantine-primary-color-filled)" : undefined}
          px={isToday ? 6 : 0}
          style={{ borderRadius: 10 }}
        >
          {dayjs(day).date()}
        </Text>
        {onCreate && (
          <IconPlus size={12} className="pl-day-plus" color="var(--mantine-color-dimmed)" aria-hidden />
        )}
      </Group>
      <Stack gap={3}>{children}</Stack>
    </Box>
  );
}

export function CalendarView({ brandId, timezone, weekStart, filters, canWrite }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(() => dayjs().tz(timezone).format("YYYY-MM-DD"));
  const days = useMemo(() => gridDays(anchor, mode, timezone, weekStart), [anchor, mode, timezone, weekStart]);
  const from = days[0]!.toISOString();
  const to = days[days.length - 1]!.add(1, "day").toISOString();
  const key = postsKey(brandId, filters, { from, to, unscheduled: "exclude", order: "asc", limit: "500" });
  const { data, isLoading, mutate } = useSWR<PostGroupDTO[]>(key, { refreshInterval: 30_000 });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const byDay = useMemo(() => {
    const m = new Map<string, PostGroupDTO[]>();
    for (const g of data ?? []) {
      if (!g.scheduledAt) continue;
      const k = dayKey(g.scheduledAt, timezone);
      m.set(k, [...(m.get(k) ?? []), g]);
    }
    return m;
  }, [data, timezone]);

  const today = dayjs().tz(timezone).format("YYYY-MM-DD");
  const anchorD = dayjs.tz(`${anchor} 00:00:00`, timezone);
  const title = mode === "month" ? anchorD.format("MMMM YYYY") : `${days[0]!.format("MMM D")} – ${days[6]!.format("MMM D, YYYY")}`;

  async function onDragEnd(e: DragEndEvent) {
    const g = (data ?? []).find((x) => x.id === e.active.id);
    const target = e.over?.id as string | undefined;
    if (!g || !target || !g.scheduledAt) return;
    if (dayKey(g.scheduledAt, timezone) === target) return;
    if (isLockedStatus(g.status) || g.status === "GENERATING") {
      return notifyError(new Error("Posts lock while publishing or after publishing"));
    }
    const next = moveToDay(g.scheduledAt, target, timezone);
    if (new Date(next).getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
      return notifyError(new Error("Choose a schedule time at least 2 minutes from now"));
    }
    const optimistic = (data ?? []).map((x) => (x.id === g.id ? { ...x, scheduledAt: next } : x));
    try {
      await mutate(
        async () => {
          await api(`/api/brands/${brandId}/posts/${g.id}`, "PATCH", { scheduledAt: next });
          return optimistic;
        },
        { optimisticData: optimistic, rollbackOnError: true, revalidate: true },
      );
      notifyOk(`Moved to ${dayjs(next).tz(timezone).format("ddd, MMM D · h:mm A")}`);
    } catch (err) {
      notifyError(err, brandId);
    }
  }

  const step = (dir: 1 | -1) => setAnchor(anchorD.add(dir, mode).format("YYYY-MM-DD"));

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs">
          <ActionIcon variant="default" onClick={() => step(-1)} aria-label={`Previous ${mode}`}>
            <IconChevronLeft size={16} />
          </ActionIcon>
          <ActionIcon variant="default" onClick={() => step(1)} aria-label={`Next ${mode}`}>
            <IconChevronRight size={16} />
          </ActionIcon>
          <Button size="xs" variant="default" onClick={() => setAnchor(today)}>
            Today
          </Button>
          <Title order={4} ml="xs">
            {title}
          </Title>
        </Group>
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(v) => setMode(v as "month" | "week")}
          data={[
            { value: "month", label: "Month" },
            { value: "week", label: "Week" },
          ]}
          aria-label="Calendar range"
        />
      </Group>

      <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
        <Box style={{ overflowX: "auto" }}>
          <Box miw={mode === "month" ? 700 : 760}>
            <SimpleGrid cols={7} spacing={0} style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
              {weekdayLabels(weekStart).map((d) => (
                <Text key={d} size="xs" fw={700} c="dimmed" ta="center" py={6} tt="uppercase">
                  {d}
                </Text>
              ))}
            </SimpleGrid>
            {isLoading ? (
              <Skeleton h={mode === "month" ? 560 : 360} radius={0} />
            ) : (
              <DndContext sensors={sensors} onDragEnd={onDragEnd}>
                <SimpleGrid cols={7} spacing={0}>
                  {days.map((d) => {
                    const k = d.format("YYYY-MM-DD");
                    const posts = byDay.get(k) ?? [];
                    const isPast = k < today;
                    const max = mode === "month" ? 4 : 50;
                    return (
                      <DayCell
                        key={k}
                        day={k}
                        tall={mode === "week"}
                        inMonth={mode === "week" || d.month() === anchorD.month()}
                        isToday={k === today}
                        isPast={isPast}
                        posts={posts.length}
                        onCreate={canWrite && !isPast ? () => router.push(`/app/${brandId}/posts/new?date=${k}`) : undefined}
                      >
                        {posts.slice(0, max).map((g) => (
                          <Chip key={g.id} brandId={brandId} g={g} timezone={timezone} draggable={canWrite && !isLockedStatus(g.status) && g.status !== "GENERATING"} />
                        ))}
                        {posts.length > max && (
                          <UnstyledButton
                            onClick={(e) => {
                              e.stopPropagation();
                              setMode("week");
                              setAnchor(k);
                            }}
                          >
                            <Text size="xs" c="dimmed">
                              +{posts.length - max} more
                            </Text>
                          </UnstyledButton>
                        )}
                      </DayCell>
                    );
                  })}
                </SimpleGrid>
              </DndContext>
            )}
          </Box>
        </Box>
      </Paper>
      {canWrite && (
        <Text size="xs" c="dimmed">
          Drag a post to another day to reschedule it (keeps the time). Click an empty day to create a post. Times shown in {timezone}.
        </Text>
      )}
    </Stack>
  );
}

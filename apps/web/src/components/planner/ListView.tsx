"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Alert, Group, SegmentedControl, Skeleton, Stack, Text } from "@mantine/core";
import type { PostGroupDTO } from "@/lib/posts/types";
import { dayjs, dayKey } from "@/components/posts/tz";
import { PostRow } from "./PostRow";
import { postsKey, useRetry, type PlannerFilters } from "./shared";
import { PlannerEmpty } from "./PlannerEmpty";

export function ListView({ brandId, timezone, filters, canWrite }: { brandId: string; timezone: string; filters: PlannerFilters; canWrite: boolean }) {
  const [mode, setMode] = useState<"upcoming" | "past">("upcoming");
  const startOfToday = useMemo(() => dayjs().tz(timezone).startOf("day").toISOString(), [timezone]);
  const key =
    mode === "upcoming"
      ? postsKey(brandId, filters, { from: startOfToday, unscheduled: "include", order: "asc" })
      : postsKey(brandId, filters, { to: startOfToday, order: "desc", limit: "200" });
  const { data, error, isLoading } = useSWR<PostGroupDTO[]>(key, { refreshInterval: 30_000 });
  const retry = useRetry(brandId);

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: PostGroupDTO[] }[] = [];
    const unscheduled = (data ?? []).filter((g) => !g.scheduledAt);
    if (unscheduled.length) out.push({ key: "none", label: "Unscheduled drafts", items: unscheduled });
    const today = dayjs().tz(timezone).format("YYYY-MM-DD");
    const tomorrow = dayjs().tz(timezone).add(1, "day").format("YYYY-MM-DD");
    for (const g of data ?? []) {
      if (!g.scheduledAt) continue;
      const k = dayKey(g.scheduledAt, timezone);
      let bucket = out.find((b) => b.key === k);
      if (!bucket) {
        const d = dayjs(g.scheduledAt).tz(timezone);
        const label = k === today ? `Today · ${d.format("ddd, MMM D")}` : k === tomorrow ? `Tomorrow · ${d.format("ddd, MMM D")}` : d.format("dddd, MMMM D, YYYY");
        bucket = { key: k, label, items: [] };
        out.push(bucket);
      }
      bucket.items.push(g);
    }
    return out;
  }, [data, timezone]);

  return (
    <Stack gap="md">
      <Group>
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(v) => setMode(v as "upcoming" | "past")}
          data={[
            { value: "upcoming", label: "Upcoming" },
            { value: "past", label: "Past" },
          ]}
          aria-label="Time range"
        />
      </Group>
      {error && <Alert color="red">{error.message}</Alert>}
      {isLoading && (
        <Stack gap="xs">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} h={64} radius="md" />
          ))}
        </Stack>
      )}
      {!isLoading && data && data.length === 0 && (
        <PlannerEmpty brandId={brandId} canWrite={canWrite} filtered={!!(filters.status || filters.channelId || filters.labelId || filters.q)} past={mode === "past"} />
      )}
      {groups.map((b) => (
        <Stack key={b.key} gap="xs">
          <Text size="sm" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4 }}>
            {b.label}
          </Text>
          {b.items.map((g) => (
            <PostRow key={g.id} brandId={brandId} group={g} timezone={timezone} onRetry={canWrite ? retry : undefined} />
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

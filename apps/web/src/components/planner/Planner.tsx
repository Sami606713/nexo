"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button, Group, Menu, SegmentedControl, Select, Stack, TextInput, Title } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconCalendar, IconChevronDown, IconLayoutKanban, IconList, IconPencilPlus, IconPlus, IconSearch, IconShare, IconSparkles } from "@tabler/icons-react";
import { POST_STATUSES, STATUS_LABELS } from "@postline/core";
import { useBrand } from "@/components/shell/BrandContext";
import { useBrandChannels, useLabels } from "@/components/posts/utils";
import { ListView } from "./ListView";
import { CalendarView } from "./CalendarView";
import { BoardView } from "./BoardView";
import { ShareCalendarModal } from "./ShareCalendarModal";
import type { PlannerFilters } from "./shared";

export type PlannerView = "list" | "calendar" | "board";

const HIDDEN_FOR_CLIENT = new Set(["DRAFT", "GENERATING", "PENDING_APPROVAL"]);

export function Planner({ initialView }: { initialView: PlannerView }) {
  const brand = useBrand();
  const brandId = brand.brandId;
  const router = useRouter();
  const pathname = usePathname();
  const canWrite = brand.can("posts.write");
  const canViewDrafts = brand.can("posts.viewDrafts");

  const [view, setView] = useState<PlannerView>(initialView);
  const [status, setStatus] = useState<string | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [labelId, setLabelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [q] = useDebouncedValue(search, 300);
  const [shareOpen, setShareOpen] = useState(false);
  const { channels } = useBrandChannels(brandId);
  const { labels } = useLabels(brandId);

  useEffect(() => {
    router.replace(`${pathname}?view=${view}`, { scroll: false });
  }, [view, pathname, router]);

  const filters: PlannerFilters = { status, channelId, labelId, q };

  return (
    <Stack gap="md" p={{ base: "sm", sm: "md" }} maw={1400} mx="auto">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Title order={2}>Planner</Title>
        <Group gap="xs">
          <SegmentedControl
            value={view}
            onChange={(v) => setView(v as PlannerView)}
            aria-label="Planner view"
            data={[
              { value: "list", label: <Group gap={4} wrap="nowrap"><IconList size={14} /> List</Group> },
              { value: "calendar", label: <Group gap={4} wrap="nowrap"><IconCalendar size={14} /> Calendar</Group> },
              { value: "board", label: <Group gap={4} wrap="nowrap"><IconLayoutKanban size={14} /> Board</Group> },
            ]}
          />
          {canWrite && (
            <Button variant="default" leftSection={<IconShare size={16} />} onClick={() => setShareOpen(true)} visibleFrom="sm">
              Share
            </Button>
          )}
          {canWrite && (
            <Menu position="bottom-end" shadow="md">
              <Menu.Target>
                <Button leftSection={<IconPlus size={16} />} rightSection={<IconChevronDown size={14} />}>
                  Create
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item component={Link} href={`/app/${brandId}/posts/ai`} leftSection={<IconSparkles size={14} />}>
                  Create with AI
                </Menu.Item>
                <Menu.Item component={Link} href={`/app/${brandId}/posts/new`} leftSection={<IconPencilPlus size={14} />}>
                  New post
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Group>

      <Group gap="xs" wrap="wrap">
        <TextInput
          leftSection={<IconSearch size={14} />}
          placeholder="Search posts"
          aria-label="Search posts"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          w={{ base: "100%", xs: 220 }}
        />
        <Select
          placeholder="All statuses"
          aria-label="Filter by status"
          clearable
          w={170}
          value={status}
          onChange={setStatus}
          data={POST_STATUSES.filter((s) => canViewDrafts || !HIDDEN_FOR_CLIENT.has(s)).map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
        />
        <Select
          placeholder="All channels"
          aria-label="Filter by channel"
          clearable
          searchable
          w={190}
          value={channelId}
          onChange={setChannelId}
          data={channels.map((c) => ({ value: c.id, label: c.name }))}
        />
        {labels.length > 0 && (
          <Select
            placeholder="All labels"
            aria-label="Filter by label"
            clearable
            w={160}
            value={labelId}
            onChange={setLabelId}
            data={labels.map((l) => ({ value: l.id, label: l.name }))}
          />
        )}
      </Group>

      {view === "list" && <ListView brandId={brandId} timezone={brand.timezone} filters={filters} canWrite={canWrite} />}
      {view === "calendar" && <CalendarView brandId={brandId} timezone={brand.timezone} weekStart={brand.weekStart} filters={filters} canWrite={canWrite} />}
      {view === "board" && <BoardView brandId={brandId} timezone={brand.timezone} filters={filters} canWrite={canWrite} />}

      {canWrite && <ShareCalendarModal brandId={brandId} opened={shareOpen} onClose={() => setShareOpen(false)} />}
    </Stack>
  );
}

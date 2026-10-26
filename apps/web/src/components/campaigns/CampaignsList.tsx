"use client";

import Link from "next/link";
import useSWR from "swr";
import { Box, Button, Card, Group, Progress, Skeleton, Stack, Text } from "@mantine/core";

const GRID: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 };
import { IconAlertTriangle, IconCalendarStats, IconPlus, IconSparkles } from "@tabler/icons-react";
import { useBrand } from "@/components/shell/BrandContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import type { CampaignDTO } from "./types";
import { CampaignStatusBadge, GoalBadge, ThumbMosaic, formatRange } from "./shared";

export function progressValue(c: Pick<CampaignDTO, "status" | "progress">): number {
  if (c.status !== "GENERATING") return 100;
  const p = c.progress;
  if (!p || p.stage === "writing") return 18;
  return 35 + Math.round((65 * p.done) / Math.max(1, p.total));
}

export function progressLabel(c: Pick<CampaignDTO, "progress" | "count">): string {
  const p = c.progress;
  if (p?.stage === "images") return `Creating images · ${p.done}/${p.total} posts`;
  return `Writing ${c.count} posts…`;
}

function CampaignCard({ c, brandId }: { c: CampaignDTO; brandId: string }) {
  return (
    <Card
      withBorder
      radius="lg"
      padding={0}
      component={Link}
      href={`/app/${brandId}/campaigns/${c.id}`}
      style={{ textDecoration: "none", transition: "transform 120ms ease, box-shadow 120ms ease" }}
      className="campaign-card"
    >
      <ThumbMosaic urls={c.thumbs} goal={c.goal} />
      <Stack gap="xs" p="md">
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <GoalBadge goal={c.goal} />
          <CampaignStatusBadge status={c.status} />
        </Group>
        <Text fw={600} lineClamp={2} mih={44}>
          {c.prompt}
        </Text>
        <Group gap={6} c="dimmed">
          <IconCalendarStats size={15} />
          <Text size="sm">
            {formatRange(c.startDate, c.endDate)} · {c.durationDays} day{c.durationDays === 1 ? "" : "s"}
          </Text>
        </Group>
        {c.status === "GENERATING" ? (
          <Stack gap={4}>
            <Progress value={progressValue(c)} animated striped color="violet" size="sm" radius="xl" />
            <Text size="xs" c="dimmed">
              {progressLabel(c)}
            </Text>
          </Stack>
        ) : c.status === "ERROR" ? (
          <Group gap={6} c="red" wrap="nowrap">
            <IconAlertTriangle size={15} />
            <Text size="sm" lineClamp={1}>
              {c.error}
            </Text>
          </Group>
        ) : (
          <Stack gap={4}>
            <Progress value={c.postsCount ? (100 * c.scheduledCount) / c.postsCount : 0} color="teal" size="sm" radius="xl" />
            <Text size="xs" c="dimmed">
              {c.postsCount} post{c.postsCount === 1 ? "" : "s"} · {c.scheduledCount} scheduled
              {c.audience ? ` · ${c.audience}` : ""}
            </Text>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

export function CampaignsList() {
  const brand = useBrand();
  const brandId = brand.brandId;
  const { data, isLoading } = useSWR<{ items: CampaignDTO[] }>(`/api/brands/${brandId}/campaigns`, {
    refreshInterval: (latest) => (latest?.items.some((c) => c.status === "GENERATING") ? 2500 : 0),
  });
  const items = data?.items ?? [];
  const canWrite = brand.can("posts.write");

  return (
    <Stack gap="md" p="md" maw={1400} mx="auto" w="100%">
      <style>{`.campaign-card:hover{transform:translateY(-2px);box-shadow:var(--mantine-shadow-md)}`}</style>
      <PageHeader
        title="Campaigns"
        description="Turn one idea into a scheduled series of on-brand posts — captions, visuals and timing included."
        actions={
          canWrite && (
            <Button component={Link} href={`/app/${brandId}/campaigns/new`} leftSection={<IconPlus size={16} />}>
              New campaign
            </Button>
          )
        }
      />
      {isLoading && (
        <Box style={GRID}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} h={300} radius="lg" />
          ))}
        </Box>
      )}
      {!isLoading && items.length === 0 && (
        <EmptyState
          icon={<IconSparkles size={28} />}
          title="Plan a whole campaign in one go"
          description="Describe what you're promoting, pick a goal and a date range, and AI drafts every post — ready for you to review, tweak and schedule."
          action={
            canWrite && (
              <Button component={Link} href={`/app/${brandId}/campaigns/new`} leftSection={<IconSparkles size={16} />} mt="xs">
                Create your first campaign
              </Button>
            )
          }
        />
      )}
      {items.length > 0 && (
        <Box style={GRID}>
          {items.map((c) => (
            <CampaignCard key={c.id} c={c} brandId={brandId} />
          ))}
        </Box>
      )}
    </Stack>
  );
}

"use client";

import "@mantine/charts/styles.css";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import useSWR from "swr";
import dayjs from "dayjs";
import {
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Menu,
  MultiSelect,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from "@mantine/core";
import { DatePickerInput, type DatesRangeValue } from "@mantine/dates";
import { BarChart, LineChart } from "@mantine/charts";
import { TrendAreaChart } from "./TrendAreaChart";
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconChartBar,
  IconClick,
  IconDownload,
  IconEye,
  IconHeart,
  IconExternalLink,
  IconPercentage,
  IconSend,
  IconUsersPlus,
} from "@tabler/icons-react";
import { NETWORK_LABELS, type Network } from "@postline/core";
import { useBrand } from "@/components/shell/BrandContext";
import { NetworkIcon } from "@/components/channels/networkMeta";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

// ───────────────────────── types ─────────────────────────
interface Totals {
  impressions: number;
  engagement: number;
  engagementRate: number;
  followersGrowth: number;
  followers: number;
  postsPublished: number;
  linkClicks: number;
}
interface OverviewDto {
  current: Totals;
  previous: Totals;
  change: Record<keyof Totals, number | null>;
}
interface TimeseriesDto {
  daily: { date: string; impressions: number; engagement: number }[];
  followers: { channels: { id: string; name: string; network: Network }[]; rows: Record<string, number | string>[] };
  byNetwork: { network: Network; engagement: number; impressions: number; posts: number; clicks: number }[];
}
interface TopPost {
  postId: string;
  groupId: string;
  publishedAt: string;
  url: string | null;
  caption: string;
  channelName: string;
  network: Network;
  impressions: number;
  engagement: number;
  engagementRate: number;
  clicks: number;
}
interface BestTimesDto {
  timezone: string;
  source: "history" | "default";
  postsAnalyzed: number;
  grid: number[][];
  counts: number[][];
  max: number;
  top: { weekday: number; hour: number; label: string; relative: number; posts: number }[];
}
interface ChannelDto {
  id: string;
  name: string;
  network: Network;
}

/** Chart-friendly network colors (readable in light & dark — no pure black). */
const CHART_COLOR: Partial<Record<Network, string>> = {
  INSTAGRAM: "pink.6",
  FACEBOOK: "blue.6",
  X: "gray.6",
  LINKEDIN: "cyan.7",
  LINKEDIN_PAGE: "cyan.7",
  TIKTOK: "teal.5",
  THREADS: "grape.5",
  BLUESKY: "indigo.4",
  MASTODON: "violet.6",
  PINTEREST: "red.6",
  YOUTUBE: "red.7",
  TELEGRAM: "lime.6",
  DISCORD: "indigo.6",
  SLACK: "orange.6",
  GOOGLE_BUSINESS: "yellow.6",
  CUSTOM_WEBHOOK: "dark.3",
};
const FALLBACK_COLORS = ["indigo.6", "teal.6", "orange.6", "grape.6", "cyan.6", "lime.6", "pink.6", "yellow.6"];

const compact = (n: number) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const pctFmt = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Preset = "7" | "30" | "90" | "custom";

function toQuery(from: Date, to: Date, channelIds: string[]) {
  const sp = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  if (channelIds.length) sp.set("channelIds", channelIds.join(","));
  return sp.toString();
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ───────────────────────── page ─────────────────────────
export function AnalyticsDashboard() {
  const b = useBrand();
  const [preset, setPreset] = useState<Preset>("30");
  const [custom, setCustom] = useState<DatesRangeValue>([null, null]);
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [metric, setMetric] = useState<"impressions" | "engagement">("impressions");

  const { from, to } = useMemo(() => {
    if (preset === "custom" && custom[0] && custom[1])
      return { from: dayjs(custom[0]).startOf("day").toDate(), to: dayjs(custom[1]).endOf("day").toDate() };
    const days = preset === "custom" ? 30 : Number(preset);
    // Round to the minute so SWR keys are stable between renders.
    const end = dayjs().endOf("minute");
    return { from: end.subtract(days, "day").startOf("day").toDate(), to: end.toDate() };
  }, [preset, custom]);

  const q = toQuery(from, to, channelIds);
  const base = `/api/brands/${b.brandId}/analytics`;
  const { data: channels } = useSWR<ChannelDto[]>(`/api/brands/${b.brandId}/channels`);
  const overview = useSWR<OverviewDto>(`${base}/overview?${q}`, { keepPreviousData: true });
  const series = useSWR<TimeseriesDto>(`${base}/timeseries?${q}`, { keepPreviousData: true });
  const top = useSWR<{ total: number; posts: TopPost[] }>(`${base}/top-posts?${q}&limit=10`, { keepPreviousData: true });
  const best = useSWR<BestTimesDto>(`${base}/best-times?${toQuery(dayjs(to).subtract(90, "day").toDate(), to, channelIds)}`, {
    keepPreviousData: true,
  });

  const loadError = overview.error || series.error;
  const noData = overview.data && overview.data.current.postsPublished === 0 && overview.data.current.impressions === 0;

  const exportCsv = async (kind: "daily" | "posts") => {
    const stamp = `${dayjs(from).format("YYYYMMDD")}-${dayjs(to).format("YYYYMMDD")}`;
    if (kind === "daily" && series.data) {
      downloadCsv(`analytics-daily-${stamp}.csv`, [
        ["date", "impressions", "engagement"],
        ...series.data.daily.map((d) => [d.date, d.impressions, d.engagement]),
      ]);
    } else {
      const res = await fetch(`${base}/top-posts?${q}&limit=200`);
      const body = (await res.json()) as { posts: TopPost[] };
      downloadCsv(`analytics-posts-${stamp}.csv`, [
        ["published_at", "channel", "network", "caption", "impressions", "engagement", "engagement_rate", "link_clicks", "url"],
        ...body.posts.map((p) => [
          p.publishedAt,
          p.channelName,
          p.network,
          p.caption,
          p.impressions,
          p.engagement,
          (p.engagementRate * 100).toFixed(2),
          p.clicks,
          p.url ?? "",
        ]),
      ]);
    }
  };

  return (
    <>
      <PageHeader
        title="Analytics"
        description="How your content is performing across every connected channel."
        actions={
          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <Button variant="default" leftSection={<IconDownload size={16} />}>
                Export CSV
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => void exportCsv("daily")}>Daily totals</Menu.Item>
              <Menu.Item onClick={() => void exportCsv("posts")}>Post performance</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        }
      />

      <Paper withBorder radius="lg" p="sm" mb="lg">
        <Group gap="sm" wrap="wrap">
          <SegmentedControl
            value={preset}
            onChange={(v) => setPreset(v as Preset)}
            data={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
              { value: "custom", label: "Custom" },
            ]}
          />
          {preset === "custom" && (
            <DatePickerInput
              type="range"
              value={custom}
              onChange={setCustom}
              placeholder="Pick a date range"
              maxDate={new Date()}
              w={260}
              clearable
            />
          )}
          <MultiSelect
            placeholder={channelIds.length ? undefined : "All channels"}
            data={(channels ?? []).map((c) => ({ value: c.id, label: `${c.name} · ${NETWORK_LABELS[c.network]}` }))}
            value={channelIds}
            onChange={setChannelIds}
            clearable
            searchable
            maxDropdownHeight={280}
            style={{ flex: 1, minWidth: 220 }}
          />
          <Text size="xs" c="dimmed" ml="auto">
            {dayjs(from).format("MMM D")} – {dayjs(to).format("MMM D, YYYY")} · compared with the previous {dayjs(to).diff(from, "day") + 1} days
          </Text>
        </Group>
      </Paper>

      {loadError ? (
        <Text c="red">Couldn&apos;t load analytics. Try again in a moment.</Text>
      ) : noData ? (
        <EmptyState
          icon={<IconChartBar size={26} />}
          title="No data for this period yet"
          description="Once your posts go live, impressions, engagement and follower growth will show up here. Try a longer range or a different channel."
        />
      ) : (
        <Stack gap="lg">
          <KpiGrid data={overview.data} />

          <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg">
            <ChartCard
              title={metric === "impressions" ? "Impressions over time" : "Engagement over time"}
              subtitle="Daily totals"
              span={2}
              right={
                <SegmentedControl
                  size="xs"
                  value={metric}
                  onChange={(v) => setMetric(v as "impressions" | "engagement")}
                  data={[
                    { value: "impressions", label: "Impressions" },
                    { value: "engagement", label: "Engagement" },
                  ]}
                />
              }
            >
              {series.data ? (
                <TrendAreaChart
                  h={280}
                  data={series.data.daily.map((d) => ({ ...d, label: dayjs(d.date).format("MMM D") }))}
                  dataKey="label"
                  series={[
                    metric === "impressions"
                      ? { name: "impressions", label: "Impressions", color: "indigo.5" }
                      : { name: "engagement", label: "Engagement", color: "teal.5" },
                  ]}
                  tickFormatter={compact}
                />
              ) : (
                <Skeleton h={280} radius="md" />
              )}
            </ChartCard>
            <ChartCard title="Engagement by network" subtitle="Likes, comments, shares & saves">
              {series.data ? (
                series.data.byNetwork.length ? (
                  <BarChart
                    h={280}
                    data={series.data.byNetwork.map((n) => ({ network: NETWORK_LABELS[n.network].replace(" (Twitter)", ""), engagement: n.engagement }))}
                    dataKey="network"
                    orientation="vertical"
                    series={[{ name: "engagement", label: "Engagement", color: "violet.5" }]}
                    valueFormatter={(v) => v.toLocaleString()}
                    yAxisProps={{ width: 96 }}
                    xAxisProps={{ tickFormatter: (v: number) => compact(v) }}
                    gridAxis="x"
                    barProps={{ radius: 4 }}
                  />
                ) : (
                  <ChartEmpty />
                )
              ) : (
                <Skeleton h={280} radius="md" />
              )}
            </ChartCard>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
            <ChartCard title="Followers by channel" subtitle="Audience size over time">
              {series.data ? (
                series.data.followers.channels.length ? (
                  <LineChart
                    h={300}
                    data={series.data.followers.rows.map((r) => ({ ...r, label: dayjs(String(r.date)).format("MMM D") }))}
                    dataKey="label"
                    series={series.data.followers.channels.map((c, i) => ({
                      name: c.id,
                      label: `${NETWORK_LABELS[c.network].replace(" (Twitter)", "")}`,
                      color: CHART_COLOR[c.network] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]!,
                    }))}
                    curveType="monotone"
                    withDots={false}
                    valueFormatter={(v) => v.toLocaleString()}
                    yAxisProps={{ tickFormatter: (v: number) => compact(v), width: 48 }}
                    withLegend
                    legendProps={{ verticalAlign: "bottom", height: 56 }}
                    gridAxis="y"
                    connectNulls
                  />
                ) : (
                  <ChartEmpty />
                )
              ) : (
                <Skeleton h={300} radius="md" />
              )}
            </ChartCard>
            <ChartCard
              title="Best time to post"
              subtitle={best.data ? `Avg. engagement rate by weekday & hour · ${best.data.timezone} · last 90 days` : "Engagement by weekday & hour"}
            >
              {best.data ? <BestTimeHeatmap data={best.data} /> : <Skeleton h={300} radius="md" />}
            </ChartCard>
          </SimpleGrid>

          <TopPostsTable brandId={b.brandId} data={top.data} />
        </Stack>
      )}
    </>
  );
}

// ───────────────────────── pieces ─────────────────────────
function ChartCard({
  title,
  subtitle,
  children,
  span,
  right,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  span?: number;
  right?: ReactNode;
}) {
  return (
    <Card withBorder radius="lg" padding="lg" style={span ? { gridColumn: `span ${span}` } : undefined} className="pl-chart-card">
      <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
        <div>
          <Text fw={600}>{title}</Text>
          {subtitle && (
            <Text size="xs" c="dimmed">
              {subtitle}
            </Text>
          )}
        </div>
        {right}
      </Group>
      {children}
      <style>{`@media (max-width: 75em) { .pl-chart-card { grid-column: auto !important; } }`}</style>
    </Card>
  );
}

function ChartEmpty() {
  return (
    <Stack h={260} align="center" justify="center">
      <Text size="sm" c="dimmed">
        Not enough data in this range.
      </Text>
    </Stack>
  );
}

function Change({ value, invert }: { value: number | null | undefined; invert?: boolean }) {
  if (value === undefined) return null;
  if (value === null)
    return (
      <Badge size="sm" variant="light" color="gray">
        new
      </Badge>
    );
  const up = value >= 0;
  const good = invert ? !up : up;
  return (
    <Badge
      size="sm"
      variant="light"
      color={Math.abs(value) < 0.005 ? "gray" : good ? "teal" : "red"}
      leftSection={up ? <IconArrowUpRight size={12} /> : <IconArrowDownRight size={12} />}
    >
      {Math.abs(value * 100).toFixed(Math.abs(value) < 0.1 ? 1 : 0)}%
    </Badge>
  );
}

function KpiGrid({ data }: { data: OverviewDto | undefined }) {
  const items: { key: keyof Totals; label: string; icon: ReactNode; color: string; fmt: (t: Totals) => string; hint?: (t: Totals) => string }[] = [
    { key: "impressions", label: "Impressions", icon: <IconEye size={18} />, color: "indigo", fmt: (t) => compact(t.impressions) },
    { key: "engagement", label: "Engagement", icon: <IconHeart size={18} />, color: "pink", fmt: (t) => compact(t.engagement) },
    { key: "engagementRate", label: "Engagement rate", icon: <IconPercentage size={18} />, color: "teal", fmt: (t) => pctFmt(t.engagementRate, 2) },
    {
      key: "followersGrowth",
      label: "Follower growth",
      icon: <IconUsersPlus size={18} />,
      color: "violet",
      fmt: (t) => `${t.followersGrowth >= 0 ? "+" : ""}${compact(t.followersGrowth)}`,
      hint: (t) => `${t.followers.toLocaleString()} total`,
    },
    { key: "postsPublished", label: "Posts published", icon: <IconSend size={18} />, color: "orange", fmt: (t) => t.postsPublished.toLocaleString() },
    { key: "linkClicks", label: "Link clicks", icon: <IconClick size={18} />, color: "cyan", fmt: (t) => compact(t.linkClicks) },
  ];
  return (
    <SimpleGrid cols={{ base: 2, sm: 3, xl: 6 }} spacing="md">
      {items.map((it) => (
        <Card key={it.key} withBorder radius="lg" padding="md">
          <Group justify="space-between" mb="xs" wrap="nowrap">
            <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: 0.3 }} truncate>
              {it.label}
            </Text>
            <ThemeIcon size={28} radius="md" variant="light" color={it.color}>
              {it.icon}
            </ThemeIcon>
          </Group>
          {data ? (
            <>
              <Text fz={26} fw={700} lh={1.1}>
                {it.fmt(data.current)}
              </Text>
              <Group gap={6} mt={6} wrap="nowrap">
                <Tooltip label={`Previous period: ${it.fmt(data.previous)}`}>
                  <span>
                    <Change value={data.change[it.key]} />
                  </span>
                </Tooltip>
                <Text size="xs" c="dimmed" truncate>
                  {it.hint ? it.hint(data.current) : "vs prev. period"}
                </Text>
              </Group>
            </>
          ) : (
            <>
              <Skeleton h={28} w="70%" />
              <Skeleton h={16} w="50%" mt={8} />
            </>
          )}
        </Card>
      ))}
    </SimpleGrid>
  );
}

function BestTimeHeatmap({ data }: { data: BestTimesDto }) {
  // Show Mon→Sun rows, hours 6am–11pm (where nearly all activity happens) plus a compact header.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const hours = Array.from({ length: 18 }, (_, i) => i + 6);
  const max = data.max || 1;
  const topKeys = new Set(data.top.map((t) => `${t.weekday}-${t.hour}`));
  return (
    <Stack gap="sm">
      <Box style={{ overflowX: "auto" }}>
        <Box style={{ display: "grid", gridTemplateColumns: `36px repeat(${hours.length}, minmax(14px, 1fr))`, gap: 3, minWidth: 420 }}>
          <span />
          {hours.map((h) => (
            <Text key={h} size="10px" c="dimmed" ta="center">
              {h % 3 === 0 ? (h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`) : ""}
            </Text>
          ))}
          {order.map((wd) => (
            <Box key={wd} style={{ display: "contents" }}>
              <Text size="xs" c="dimmed" lh="22px">
                {WEEKDAYS_SHORT[wd]}
              </Text>
              {hours.map((h) => {
                const v = data.grid[wd]?.[h] ?? 0;
                const n = data.counts[wd]?.[h] ?? 0;
                const intensity = v / max;
                const isTop = topKeys.has(`${wd}-${h}`) && data.source === "history";
                return (
                  <Tooltip
                    key={h}
                    label={n ? `${WEEKDAYS_SHORT[wd]} ${h}:00 · ${v.toFixed(1)}% avg ER · ${n} post${n === 1 ? "" : "s"}` : `${WEEKDAYS_SHORT[wd]} ${h}:00 · no posts`}
                    withArrow
                  >
                    <Box
                      h={22}
                      style={{
                        borderRadius: 4,
                        background: n
                          ? `color-mix(in srgb, var(--mantine-color-teal-6) ${Math.round(18 + intensity * 82)}%, transparent)`
                          : "var(--mantine-color-default-hover)",
                        outline: isTop ? "2px solid var(--mantine-color-orange-5)" : undefined,
                        outlineOffset: -1,
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Box>
          ))}
        </Box>
      </Box>
      <Group gap="xs" wrap="wrap">
        <Text size="xs" c="dimmed">
          {data.source === "history" ? "Top slots:" : "Suggested slots (not enough history yet):"}
        </Text>
        {data.top.map((t, i) => (
          <Badge key={`${t.weekday}-${t.hour}`} variant={i === 0 ? "filled" : "light"} color="orange" size="sm">
            {t.label}
          </Badge>
        ))}
      </Group>
    </Stack>
  );
}

function TopPostsTable({ brandId, data }: { brandId: string; data: { total: number; posts: TopPost[] } | undefined }) {
  return (
    <Card withBorder radius="lg" padding={0}>
      <Group justify="space-between" p="lg" pb="sm">
        <div>
          <Title order={5}>Top posts</Title>
          <Text size="xs" c="dimmed">
            Ranked by engagement{data ? ` · ${data.total} published in this period` : ""}
          </Text>
        </div>
      </Group>
      {!data ? (
        <Stack p="lg" pt={0}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} h={36} />
          ))}
        </Stack>
      ) : data.posts.length === 0 ? (
        <Text size="sm" c="dimmed" p="lg" pt={0}>
          No published posts in this period.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing="sm" horizontalSpacing="lg" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Post</Table.Th>
                <Table.Th>Channel</Table.Th>
                <Table.Th>Published</Table.Th>
                <Table.Th ta="right">Impressions</Table.Th>
                <Table.Th ta="right">Engagement</Table.Th>
                <Table.Th ta="right">ER</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.posts.map((p) => (
                <Table.Tr key={p.postId}>
                  <Table.Td maw={360}>
                    <Anchor component={Link} href={`/app/${brandId}/posts/${p.groupId}`} size="sm" c="var(--mantine-color-text)" lineClamp={2}>
                      {p.caption || "(no caption)"}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={8} wrap="nowrap">
                      <NetworkIcon network={p.network} size={22} />
                      <Text size="sm" truncate maw={140}>
                        {p.channelName}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                      {dayjs(p.publishedAt).format("MMM D, h:mm A")}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm">{p.impressions.toLocaleString()}</Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" fw={600}>
                      {p.engagement.toLocaleString()}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Badge variant="light" color={p.engagementRate >= 0.06 ? "teal" : p.engagementRate >= 0.03 ? "blue" : "gray"}>
                      {pctFmt(p.engagementRate)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {p.url && (
                      <Tooltip label="View on network">
                        <Anchor href={p.url} target="_blank" rel="noopener noreferrer" c="dimmed">
                          <IconExternalLink size={16} />
                        </Anchor>
                      </Tooltip>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Card>
  );
}

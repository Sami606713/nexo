"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Anchor,
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { DatePickerInput, type DatesRangeValue } from "@mantine/dates";
import { getHotkeyHandler } from "@mantine/hooks";
import { IconArrowLeft, IconCalendar, IconCoins, IconPhoto, IconSparkles, IconUsers } from "@tabler/icons-react";
import type { CampaignGoal, Length, Tone } from "@postline/core";
import { api } from "@/lib/fetcher";
import { useBrand } from "@/components/shell/BrandContext";
import { notifyError, useBrandChannels } from "@/components/posts/utils";
import { dayjs, nowInTz } from "@/components/posts/tz";
import { ChannelPicker } from "@/components/editor/ChannelPicker";
import { TONE_OPTIONS } from "@/components/editor/AiBubbleMenu";
import { STYLE_OPTIONS, type ImageStyle } from "@/components/editor/AiImageModal";
import type { CampaignDTO } from "./types";
import {
  AUDIENCES,
  FREQUENCIES,
  GOALS,
  MAX_CAMPAIGN_DAYS,
  MAX_CAMPAIGN_POSTS,
  campaignCost,
  campaignPostCount,
  daysBetween,
  type Frequency,
} from "./campaignMath";
import { GOAL_COLORS, GOAL_ICONS } from "./shared";

const IDEAS = [
  "Two-week countdown to the launch of our new product line, highlighting what makes it different",
  "A month of practical tips that help our audience get more out of our service",
  "Promote our seasonal offer and remind people before it ends",
  "Build buzz for our upcoming live workshop and drive sign-ups",
];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text size="sm" fw={500} mb={6}>
      {children}
    </Text>
  );
}

export function CampaignComposer() {
  const brand = useBrand();
  const brandId = brand.brandId;
  const router = useRouter();
  const { channels, isLoading } = useBrandChannels(brandId);
  const { data: credits } = useSWR<{ remaining: number }>(`/api/brands/${brandId}/credits`);

  const today = nowInTz(brand.timezone).format("YYYY-MM-DD");
  const [prompt, setPrompt] = useState("");
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [includeHashtags, setIncludeHashtags] = useState(true);
  const [imagesPerPost, setImagesPerPost] = useState(1);
  const [imageStyle, setImageStyle] = useState<ImageStyle>("illustration");
  const [tone, setTone] = useState<Tone>("friendly");
  const [length, setLength] = useState<Length>("medium");
  const [goal, setGoal] = useState<CampaignGoal>("awareness");
  const [audience, setAudience] = useState<string | null>(null);
  const [range, setRange] = useState<DatesRangeValue<string>>([dayjs(today).add(1, "day").format("YYYY-MM-DD"), dayjs(today).add(14, "day").format("YYYY-MM-DD")]);
  const [frequency, setFrequency] = useState<Frequency>("1");
  const [busy, setBusy] = useState(false);

  const [start, end] = range;
  const days = start && end ? daysBetween(start, end) : 0;
  const { count, capped } = campaignPostCount(days, frequency);
  const cost = campaignCost(count, imagesPerPost);
  const short = credits ? credits.remaining < cost : false;
  const maxDate = start && !end ? dayjs(start).add(MAX_CAMPAIGN_DAYS - 1, "day").format("YYYY-MM-DD") : undefined;

  const problems = useMemo(() => {
    const p: string[] = [];
    if (prompt.trim().length < 10) p.push("Describe the campaign");
    if (!channelIds.length) p.push("Pick at least one channel");
    if (!days) p.push("Pick a date range");
    else if (days > MAX_CAMPAIGN_DAYS) p.push(`Keep it within ${MAX_CAMPAIGN_DAYS} days`);
    return p;
  }, [prompt, channelIds, days]);

  async function generate() {
    if (problems.length) return notifyError(new Error(problems[0]));
    setBusy(true);
    try {
      const c = await api<CampaignDTO>(`/api/brands/${brandId}/campaigns`, "POST", {
        prompt: prompt.trim(),
        channelIds,
        includeHashtags,
        imagesPerPost,
        imageStyle: imagesPerPost ? imageStyle : undefined,
        tone,
        length,
        goal,
        audience: audience ?? undefined,
        startDate: start,
        endDate: end,
        frequency,
      });
      router.push(`/app/${brandId}/campaigns/${c.id}`);
    } catch (err) {
      notifyError(err, brandId);
      setBusy(false);
    }
  }

  return (
    <Stack maw={980} mx="auto" p="md" gap="md" w="100%">
      <Anchor component={Link} href={`/app/${brandId}/campaigns`} c="dimmed" size="sm">
        <Group gap={4}>
          <IconArrowLeft size={16} /> Campaigns
        </Group>
      </Anchor>
      <Group gap="sm">
        <ThemeIcon size={40} radius="md" variant="gradient" gradient={{ from: "violet", to: "indigo", deg: 135 }}>
          <IconSparkles size={22} />
        </ThemeIcon>
        <div>
          <Title order={2}>New AI campaign</Title>
          <Text c="dimmed" size="sm">
            One brief in, a full content calendar out — written in {brand.name}&apos;s voice. Nothing is published until you approve it.
          </Text>
        </div>
      </Group>

      <Paper withBorder radius="lg" p="lg">
        <Stack gap="lg">
          <Stack gap={8}>
            <Textarea
              label="What's the campaign about?"
              description="What you're promoting, the key messages, and anything every post should mention."
              placeholder="e.g. Launch of our new spring collection: lightweight, recycled materials, available online and in our two stores…"
              autosize
              minRows={4}
              maxRows={12}
              maxLength={4000}
              value={prompt}
              onChange={(e) => setPrompt(e.currentTarget.value)}
              onKeyDown={getHotkeyHandler([["mod+Enter", generate]])}
              disabled={busy}
              data-autofocus
            />
            {!prompt.trim() && (
              <Group gap={6}>
                {IDEAS.map((idea) => (
                  <Chip key={idea} size="xs" variant="light" checked={false} onChange={() => setPrompt(idea)}>
                    {idea.length > 48 ? `${idea.slice(0, 46)}…` : idea}
                  </Chip>
                ))}
              </Group>
            )}
          </Stack>

          <Divider label="Content" labelPosition="left" />
          <Box>
            <Label>Channels</Label>
            <ChannelPicker brandId={brandId} channels={channels} loading={isLoading} selected={channelIds} onChange={setChannelIds} readOnly={busy} />
          </Box>
          <Group gap="xl" align="flex-end" wrap="wrap">
            <Box>
              <Label>Tone</Label>
              <Select w={170} allowDeselect={false} data={TONE_OPTIONS} value={tone} onChange={(v) => v && setTone(v as Tone)} disabled={busy} />
            </Box>
            <Box>
              <Label>Length</Label>
              <SegmentedControl
                value={length}
                onChange={(v) => setLength(v as Length)}
                disabled={busy}
                data={[
                  { value: "short", label: "Short" },
                  { value: "medium", label: "Medium" },
                  { value: "long", label: "Long" },
                ]}
              />
            </Box>
            <Box>
              <Label>
                <Group gap={4} component="span">
                  <IconPhoto size={14} /> Images per post
                </Group>
              </Label>
              <SegmentedControl value={String(imagesPerPost)} onChange={(v) => setImagesPerPost(Number(v))} disabled={busy} data={["0", "1", "2", "3"]} />
            </Box>
            {imagesPerPost > 0 && (
              <Box>
                <Label>Image style</Label>
                <Select w={160} allowDeselect={false} data={STYLE_OPTIONS} value={imageStyle} onChange={(v) => v && setImageStyle(v as ImageStyle)} disabled={busy} />
              </Box>
            )}
            <Switch label="Hashtags" checked={includeHashtags} onChange={(e) => setIncludeHashtags(e.currentTarget.checked)} disabled={busy} mb={8} />
          </Group>

          <Divider label="Strategy & schedule" labelPosition="left" />
          <Box>
            <Label>Goal</Label>
            <Box style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 8 }}>
              {GOALS.map((g) => {
                const GoalIcon = GOAL_ICONS[g.value];
                const on = goal === g.value;
                const color = GOAL_COLORS[g.value];
                return (
                  <UnstyledButton
                    key={g.value}
                    onClick={() => !busy && setGoal(g.value)}
                    aria-pressed={on}
                    p="sm"
                    style={{
                      borderRadius: 12,
                      border: `1.5px solid ${on ? `var(--mantine-color-${color}-6)` : "var(--mantine-color-default-border)"}`,
                      background: on ? `var(--mantine-color-${color}-light)` : undefined,
                      transition: "all 120ms ease",
                    }}
                  >
                    <Stack gap={4}>
                      <GoalIcon size={20} color={`var(--mantine-color-${color}-6)`} />
                      <Text size="sm" fw={600}>
                        {g.label}
                      </Text>
                      <Text size="xs" c="dimmed" lh={1.3}>
                        {g.hint}
                      </Text>
                    </Stack>
                  </UnstyledButton>
                );
              })}
            </Box>
          </Box>
          <Group gap="xl" align="flex-start" wrap="wrap">
            <Select
              label="Audience"
              placeholder="Anyone (brand default)"
              leftSection={<IconUsers size={16} />}
              clearable
              w={240}
              data={[...AUDIENCES]}
              value={audience}
              onChange={setAudience}
              disabled={busy}
            />
            <DatePickerInput
              type="range"
              label="Dates"
              leftSection={<IconCalendar size={16} />}
              placeholder="Start – end"
              value={range}
              onChange={setRange}
              minDate={today}
              maxDate={maxDate}
              numberOfColumns={2}
              allowSingleDateInRange
              valueFormat="MMM D, YYYY"
              w={280}
              disabled={busy}
              description={`Up to ${MAX_CAMPAIGN_DAYS} days`}
            />
            <Select
              label="Frequency"
              w={170}
              allowDeselect={false}
              data={FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))}
              value={frequency}
              onChange={(v) => v && setFrequency(v as Frequency)}
              disabled={busy}
            />
          </Group>

          <Paper radius="md" p="md" bg="var(--mantine-color-default-hover)">
            <Group justify="space-between" wrap="wrap" gap="md">
              <Stack gap={2}>
                <Text fw={600}>
                  {count ? `${count} post${count === 1 ? "" : "s"} over ${days} day${days === 1 ? "" : "s"}` : "Pick your dates"}
                </Text>
                <Text size="xs" c="dimmed">
                  {capped ? `Capped at ${MAX_CAMPAIGN_POSTS} posts per campaign. ` : ""}
                  {count ? `${count} caption${count === 1 ? "" : "s"}${imagesPerPost ? ` + ${count * imagesPerPost} image${count * imagesPerPost === 1 ? "" : "s"}` : ""}` : ""}
                  {credits ? ` · ${credits.remaining} credits left` : ""}
                </Text>
              </Stack>
              <Group gap="sm">
                <Tooltip label={`${count} × (1 caption + ${imagesPerPost} image${imagesPerPost === 1 ? "" : "s"})`} withArrow>
                  <Badge size="xl" variant="light" color={short ? "red" : "violet"} leftSection={<IconCoins size={16} />} radius="md">
                    {cost} credit{cost === 1 ? "" : "s"}
                  </Badge>
                </Tooltip>
                <Button size="md" leftSection={<IconSparkles size={18} />} loading={busy} onClick={generate} disabled={problems.length > 0 || short}>
                  Generate campaign
                </Button>
              </Group>
            </Group>
          </Paper>
        </Stack>
      </Paper>
    </Stack>
  );
}

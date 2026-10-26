"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ActionIcon,
  Alert,
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Group,
  Image,
  Loader,
  Menu,
  Paper,
  Popover,
  Progress,
  Skeleton,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
  Title,
  Tooltip,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { modals } from "@mantine/modals";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCalendarCheck,
  IconCheck,
  IconClock,
  IconDots,
  IconExternalLink,
  IconPencil,
  IconRefresh,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import { MIN_SCHEDULE_LEAD_MS } from "@postline/core";
import { api } from "@/lib/fetcher";
import type { PostGroupDTO } from "@/lib/posts/types";
import { useBrand } from "@/components/shell/BrandContext";
import { ChannelAvatar } from "@/components/posts/ChannelAvatar";
import { StatusBadge } from "@/components/posts/StatusBadge";
import { notifyError, notifyOk } from "@/components/posts/utils";
import { PICKER_FORMAT, dayjs, isoToPicker, pickerToIso } from "@/components/posts/tz";
import type { CampaignDetailDTO } from "./types";
import { CampaignStatusBadge, GoalBadge, formatRange } from "./shared";
import { progressLabel, progressValue } from "./CampaignsList";

const angleOf = (notes: string | null) => /^Angle:\s*(.+)$/m.exec(notes ?? "")?.[1]?.trim() ?? null;

// ───────────────────────────── generating state

function GeneratingState({ c }: { c: CampaignDetailDTO }) {
  const stage = c.progress?.stage ?? "writing";
  const steps = [
    { key: "writing", label: "Planning angles & writing captions" },
    { key: "images", label: "Creating visuals" },
    { key: "review", label: "Ready for your review" },
  ];
  const activeIdx = stage === "writing" ? 0 : 1;
  return (
    <Stack gap="md">
      <Paper withBorder radius="lg" p="xl" style={{ overflow: "hidden", position: "relative" }}>
        <Box
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(600px 200px at 10% 0%, var(--mantine-color-violet-light), transparent), radial-gradient(500px 200px at 100% 100%, var(--mantine-color-indigo-light), transparent)",
            pointerEvents: "none",
          }}
        />
        <Stack gap="md" pos="relative">
          <Group gap="md">
            <ThemeIcon size={48} radius="xl" variant="gradient" gradient={{ from: "violet", to: "indigo", deg: 135 }}>
              <IconSparkles size={26} className="campaign-pulse" />
            </ThemeIcon>
            <div>
              <Title order={3}>Building your campaign</Title>
              <Text c="dimmed" size="sm">
                {progressLabel(c)} You can leave this page — we&apos;ll keep working.
              </Text>
            </div>
          </Group>
          <Progress value={progressValue(c)} animated striped color="violet" size="lg" radius="xl" />
          <Group gap="lg">
            {steps.map((s, i) => (
              <Group key={s.key} gap={6}>
                {i < activeIdx ? (
                  <ThemeIcon size={20} radius="xl" color="teal">
                    <IconCheck size={12} />
                  </ThemeIcon>
                ) : i === activeIdx ? (
                  <Loader size={16} color="violet" />
                ) : (
                  <ThemeIcon size={20} radius="xl" variant="light" color="gray">
                    <Text size="10px">{i + 1}</Text>
                  </ThemeIcon>
                )}
                <Text size="sm" c={i <= activeIdx ? undefined : "dimmed"} fw={i === activeIdx ? 600 : 400}>
                  {s.label}
                </Text>
              </Group>
            ))}
          </Group>
        </Stack>
      </Paper>
      {Array.from({ length: Math.min(4, c.count) }).map((_, i) => (
        <Card key={i} withBorder radius="lg" p="md">
          <Group align="flex-start" wrap="nowrap">
            <Skeleton h={88} w={88} radius="md" />
            <Stack gap={8} style={{ flex: 1 }}>
              <Skeleton h={12} w="35%" />
              <Skeleton h={10} />
              <Skeleton h={10} w="90%" />
              <Skeleton h={10} w="70%" />
            </Stack>
          </Group>
        </Card>
      ))}
      <style>{`@keyframes campaignPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.15);opacity:.75}}.campaign-pulse{animation:campaignPulse 1.6s ease-in-out infinite}`}</style>
    </Stack>
  );
}

// ───────────────────────────── one post in the timeline

interface ItemProps {
  brandId: string;
  campaignId: string;
  post: PostGroupDTO;
  tz: string;
  selected: boolean;
  onSelect: (on: boolean) => void;
  error?: string;
  offline: boolean;
  onChanged: () => void;
}

function TimePopover({ post, tz, onSave }: { post: PostGroupDTO; tz: string; onSave: (iso: string) => Promise<void> }) {
  const [opened, setOpened] = useState(false);
  const [value, setValue] = useState<string | null>(isoToPicker(post.scheduledAt, tz));
  const [saving, setSaving] = useState(false);
  const editable = post.status === "DRAFT";
  const label = post.scheduledAt ? dayjs(post.scheduledAt).tz(tz).format("h:mm A") : "No time";
  const iso = pickerToIso(value, tz);
  return (
    <Popover opened={opened} onChange={setOpened} withArrow shadow="md" trapFocus disabled={!editable}>
      <Popover.Target>
        <Button
          size="compact-sm"
          variant={editable ? "light" : "subtle"}
          color="gray"
          leftSection={<IconClock size={14} />}
          rightSection={editable ? <IconPencil size={12} /> : undefined}
          onClick={() => {
            setValue(isoToPicker(post.scheduledAt, tz));
            setOpened((o) => !o);
          }}
        >
          {label}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <DateTimePicker
            label={`Date & time (${tz})`}
            value={value}
            onChange={setValue}
            valueFormat="ddd, MMM D · h:mm A"
            minDate={dayjs().tz(tz).format(PICKER_FORMAT)}
            w={260}
            popoverProps={{ withinPortal: false }}
          />
          <Group justify="flex-end">
            <Button
              size="xs"
              loading={saving}
              disabled={!iso}
              onClick={async () => {
                if (!iso) return;
                setSaving(true);
                try {
                  await onSave(iso);
                  setOpened(false);
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save time
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function PostItem({ brandId, campaignId, post, tz, selected, onSelect, error, offline, onChanged }: ItemProps) {
  const [caption, setCaption] = useState(post.caption);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const isDraft = post.status === "DRAFT";
  const angle = angleOf(post.notes);
  const base = `/api/brands/${brandId}/campaigns/${campaignId}/posts/${post.id}`;

  useEffect(() => setCaption(post.caption), [post.caption]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      await api(base, "PATCH", body);
      onChanged();
    } catch (err) {
      notifyError(err, brandId);
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    setRegenerating(true);
    try {
      await api(`${base}/regenerate`, "POST");
      onChanged();
      notifyOk("Post rewritten");
    } catch (err) {
      notifyError(err, brandId);
    } finally {
      setRegenerating(false);
    }
  }

  function remove() {
    modals.openConfirmModal({
      title: "Remove this post?",
      children: <Text size="sm">It will be deleted from the campaign. This can&apos;t be undone.</Text>,
      labels: { confirm: "Remove", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await api(base, "DELETE");
          onChanged();
        } catch (err) {
          notifyError(err, brandId);
        }
      },
    });
  }

  const tooSoon = isDraft && post.scheduledAt && new Date(post.scheduledAt).getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS;

  return (
    <Card
      withBorder
      radius="lg"
      p="md"
      style={{
        borderColor: selected ? "var(--mantine-primary-color-filled)" : error ? "var(--mantine-color-red-5)" : undefined,
        boxShadow: selected ? "0 0 0 1px var(--mantine-primary-color-filled)" : undefined,
        transition: "border-color 120ms ease, box-shadow 120ms ease",
        opacity: regenerating ? 0.6 : 1,
      }}
    >
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <TimePopover post={post} tz={tz} onSave={(iso) => patch({ scheduledAt: iso })} />
            {angle && (
              <Badge variant="outline" color="gray" radius="sm" style={{ textTransform: "none", flexShrink: 1, minWidth: 0 }}>
                <Text span size="xs" truncate>
                  {angle}
                </Text>
              </Badge>
            )}
            {!isDraft && <StatusBadge status={post.status} />}
            {saving && <Loader size={14} />}
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Avatar.Group spacing={6}>
              {post.posts.map((p) => (
                <ChannelAvatar key={p.id} channel={p.channel} size={26} />
              ))}
            </Avatar.Group>
            {isDraft ? (
              <Checkbox
                aria-label="Approve this post"
                label="Approve"
                checked={selected}
                onChange={(e) => onSelect(e.currentTarget.checked)}
                disabled={regenerating}
              />
            ) : (
              <ThemeIcon size={22} radius="xl" color="teal" variant="light">
                <IconCalendarCheck size={14} />
              </ThemeIcon>
            )}
            <Menu position="bottom-end" withArrow shadow="md">
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" aria-label="Post actions">
                  <IconDots size={18} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconRefresh size={14} />} onClick={regenerate} disabled={!isDraft} rightSection={offline ? undefined : <Badge size="xs" variant="light" color="violet">1 credit</Badge>}>
                  Regenerate this post
                </Menu.Item>
                <Menu.Item leftSection={<IconExternalLink size={14} />} component={Link} href={`/app/${brandId}/posts/${post.id}`}>
                  Open in editor
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={remove} disabled={["PUBLISHING", "POSTED", "NEEDS_ATTENTION"].includes(post.status)}>
                  Delete
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>

        <Group align="flex-start" wrap="nowrap" gap="md">
          {post.media.length > 0 && (
            <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
              {post.media.slice(0, 3).map((m) => (
                <Image key={m.id} src={m.url} alt={m.alt ?? ""} w={96} h={96} radius="md" fit="cover" />
              ))}
            </Group>
          )}
          <Box style={{ flex: 1, minWidth: 0 }}>
            {regenerating ? (
              <Stack gap={8} pt={4}>
                <Skeleton h={10} />
                <Skeleton h={10} w="92%" />
                <Skeleton h={10} w="75%" />
              </Stack>
            ) : (
              <Textarea
                aria-label="Caption"
                variant="unstyled"
                autosize
                minRows={2}
                maxRows={14}
                value={caption}
                readOnly={!isDraft}
                onChange={(e) => setCaption(e.currentTarget.value)}
                onBlur={() => {
                  if (caption !== post.caption) patch({ caption }).catch(() => setCaption(post.caption));
                }}
                styles={{
                  input: {
                    fontSize: "var(--mantine-font-size-sm)",
                    lineHeight: 1.55,
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: isDraft ? "var(--mantine-color-default-hover)" : undefined,
                  },
                }}
              />
            )}
          </Box>
        </Group>
        {(error || tooSoon) && (
          <Group gap={6} c={error ? "red" : "orange"}>
            <IconAlertTriangle size={14} />
            <Text size="xs">{error ?? "This time has passed — pick a new time before approving."}</Text>
          </Group>
        )}
      </Stack>
    </Card>
  );
}

// ───────────────────────────── page

export function CampaignReview({ campaignId }: { campaignId: string }) {
  const brand = useBrand();
  const brandId = brand.brandId;
  const tz = brand.timezone;
  const router = useRouter();
  const key = `/api/brands/${brandId}/campaigns/${campaignId}`;
  const { data: c, mutate, error, isLoading } = useSWR<CampaignDetailDTO>(key, {
    refreshInterval: (latest) => (latest?.status === "GENERATING" ? 2000 : 0),
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [approving, setApproving] = useState(false);

  const drafts = useMemo(() => (c?.posts ?? []).filter((p) => p.status === "DRAFT"), [c]);
  const days = useMemo(() => {
    const map = new Map<string, PostGroupDTO[]>();
    for (const p of c?.posts ?? []) {
      const k = p.scheduledAt ? dayjs(p.scheduledAt).tz(tz).format("YYYY-MM-DD") : "unscheduled";
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return [...map.entries()].sort(([a], [b]) => (a === "unscheduled" ? 1 : b === "unscheduled" ? -1 : a.localeCompare(b)));
  }, [c, tz]);

  // drop selections for posts that are gone or no longer drafts
  useEffect(() => {
    setSelected((cur) => cur.filter((id) => drafts.some((d) => d.id === id)));
  }, [drafts]);

  async function approve() {
    if (!selected.length) return;
    setApproving(true);
    try {
      const res = await api<{ scheduled: string[]; failed: { groupId: string; error: string }[]; campaign: CampaignDetailDTO }>(`${key}/approve`, "POST", { groupIds: selected });
      await mutate(res.campaign, { revalidate: false });
      setErrors(Object.fromEntries(res.failed.map((f) => [f.groupId, f.error])));
      setSelected(res.failed.map((f) => f.groupId));
      if (res.scheduled.length) notifyOk(`${res.scheduled.length} post${res.scheduled.length === 1 ? "" : "s"} scheduled`, "Approved");
      if (res.failed.length) notifyError(new Error(`${res.failed.length} post${res.failed.length === 1 ? "" : "s"} need${res.failed.length === 1 ? "s" : ""} attention — see the highlighted items.`));
    } catch (err) {
      notifyError(err, brandId);
    } finally {
      setApproving(false);
    }
  }

  function deleteCampaign() {
    modals.openConfirmModal({
      title: "Delete this campaign?",
      children: <Text size="sm">Unscheduled drafts are deleted. Posts you already scheduled stay in your planner.</Text>,
      labels: { confirm: "Delete campaign", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await api(key, "DELETE");
          router.push(`/app/${brandId}/campaigns`);
        } catch (err) {
          notifyError(err, brandId);
        }
      },
    });
  }

  if (isLoading) {
    return (
      <Stack maw={980} mx="auto" p="md" w="100%">
        <Skeleton h={28} w={200} />
        <Skeleton h={160} radius="lg" />
      </Stack>
    );
  }
  if (error || !c) {
    return (
      <Stack maw={980} mx="auto" p="md" w="100%">
        <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Campaign not found">
          <Anchor component={Link} href={`/app/${brandId}/campaigns`}>
            Back to campaigns
          </Anchor>
        </Alert>
      </Stack>
    );
  }

  const allSelected = drafts.length > 0 && selected.length === drafts.length;
  const canWrite = brand.can("posts.write");

  return (
    <Stack maw={980} mx="auto" p="md" gap="md" w="100%">
      <Anchor component={Link} href={`/app/${brandId}/campaigns`} c="dimmed" size="sm">
        <Group gap={4}>
          <IconArrowLeft size={16} /> Campaigns
        </Group>
      </Anchor>

      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
        <Stack gap={6} style={{ minWidth: 0 }}>
          <Group gap="xs">
            <GoalBadge goal={c.goal} />
            <CampaignStatusBadge status={c.status} />
            {c.offline && c.status === "READY" && (
              <Tooltip label="Written with built-in templates because no AI key is configured on this server" withArrow multiline maw={260}>
                <Badge variant="outline" color="gray" radius="sm">
                  Template copy
                </Badge>
              </Tooltip>
            )}
          </Group>
          <Title order={2} lineClamp={2}>
            {c.prompt}
          </Title>
          <Group gap="md" c="dimmed">
            <Text size="sm">
              {formatRange(c.startDate, c.endDate)} · {c.count} posts{c.audience ? ` · ${c.audience}` : ""}
            </Text>
            <Avatar.Group spacing={6}>
              {c.channels.map((ch) => (
                <ChannelAvatar key={ch.id} channel={ch} size={24} />
              ))}
            </Avatar.Group>
          </Group>
        </Stack>
        {canWrite && (
          <Menu position="bottom-end" withArrow>
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label="Campaign actions">
                <IconDots size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={deleteCampaign}>
                Delete campaign
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>

      {c.status === "GENERATING" && <GeneratingState c={c} />}

      {c.status === "ERROR" && (
        <Alert color="red" icon={<IconAlertTriangle size={18} />} title="We couldn't generate this campaign" radius="lg">
          <Stack gap="xs">
            <Text size="sm">{c.error}</Text>
            <Group>
              <Button size="xs" component={Link} href={`/app/${brandId}/campaigns/new`} variant="white" color="red">
                Start a new campaign
              </Button>
            </Group>
          </Stack>
        </Alert>
      )}

      {c.status === "READY" && (
        <>
          {c.imagesError && (
            <Alert color="orange" icon={<IconAlertTriangle size={18} />} radius="md">
              {c.imagesError}. Posts without visuals can get images from the editor.
            </Alert>
          )}
          {canWrite && drafts.length > 0 && (
            <Paper
              withBorder
              radius="lg"
              p="sm"
              shadow="sm"
              style={{ position: "sticky", top: 8, zIndex: 5, backdropFilter: "blur(8px)", background: "color-mix(in srgb, var(--mantine-color-body) 88%, transparent)" }}
            >
              <Group justify="space-between" gap="sm">
                <Checkbox
                  label={selected.length ? `${selected.length} of ${drafts.length} selected` : `Select all ${drafts.length} drafts`}
                  checked={allSelected}
                  indeterminate={selected.length > 0 && !allSelected}
                  onChange={() => setSelected(allSelected ? [] : drafts.map((d) => d.id))}
                />
                <Group gap="xs">
                  <Text size="xs" c="dimmed" visibleFrom="sm">
                    Unapproved posts stay as drafts
                  </Text>
                  <Button leftSection={<IconCalendarCheck size={16} />} disabled={!selected.length} loading={approving} onClick={approve}>
                    Approve & schedule{selected.length ? ` (${selected.length})` : ""}
                  </Button>
                </Group>
              </Group>
            </Paper>
          )}
          {c.posts.length === 0 && (
            <Text c="dimmed" ta="center" py="xl">
              All posts were removed from this campaign.
            </Text>
          )}
          <Stack gap="lg">
            {days.map(([day, posts]) => (
              <Group key={day} align="flex-start" wrap="nowrap" gap="md">
                <Stack gap={0} align="center" w={56} style={{ flexShrink: 0, position: "sticky", top: 76 }}>
                  {day === "unscheduled" ? (
                    <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                      No date
                    </Text>
                  ) : (
                    <>
                      <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                        {dayjs(day).format("ddd")}
                      </Text>
                      <Text fz={26} fw={700} lh={1.1}>
                        {dayjs(day).format("D")}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {dayjs(day).format("MMM")}
                      </Text>
                    </>
                  )}
                </Stack>
                <Stack gap="sm" style={{ flex: 1, minWidth: 0, borderLeft: "2px solid var(--mantine-color-default-border)", paddingLeft: 16 }}>
                  {posts.map((p) => (
                    <PostItem
                      key={p.id}
                      brandId={brandId}
                      campaignId={c.id}
                      post={p}
                      tz={tz}
                      offline={c.offline}
                      selected={selected.includes(p.id)}
                      onSelect={(on) => setSelected((cur) => (on ? [...cur, p.id] : cur.filter((x) => x !== p.id)))}
                      error={errors[p.id]}
                      onChanged={() => {
                        setErrors(({ [p.id]: _drop, ...rest }) => rest);
                        void mutate();
                      }}
                    />
                  ))}
                </Stack>
              </Group>
            ))}
          </Stack>
        </>
      )}
    </Stack>
  );
}

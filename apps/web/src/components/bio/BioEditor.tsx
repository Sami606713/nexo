"use client";

import "@mantine/charts/styles.css";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import dayjs from "dayjs";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  ColorInput,
  CopyButton,
  Grid,
  Group,
  Image,
  Menu,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { TrendAreaChart } from "@/components/analytics/TrendAreaChart";
import { modals } from "@mantine/modals";
import {
  IconArrowLeft,
  IconBrandYoutube,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconExternalLink,
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconHeading,
  IconLink,
  IconPhoto,
  IconPlus,
  IconShare,
  IconTextSize,
  IconTrash,
  IconUsersGroup,
} from "@tabler/icons-react";
import { api } from "@/lib/fetcher";
import { useBrand } from "@/components/shell/BrandContext";
import { notifyError, notifySuccess } from "@/components/ui/notify";
import { BioPageView } from "./BioPageView";
import { SlugInput, useSlugCheck, type BioPageDto } from "./BioPagesList";
import {
  BACKGROUND_PRESETS,
  FONTS,
  SOCIAL_NETWORKS,
  normalizeBlocks,
  normalizeTheme,
  youtubeId,
  type BioBlock,
  type BioBlockType,
  type BioFont,
  type BioTheme,
  type ButtonStyle,
} from "./types";

interface Draft {
  slug: string;
  title: string;
  bio: string;
  avatarUrl: string | null;
  theme: BioTheme;
  blocks: BioBlock[];
  published: boolean;
}

const toDraft = (p: BioPageDto): Draft => ({
  slug: p.slug,
  title: p.title,
  bio: p.bio ?? "",
  avatarUrl: p.avatarUrl,
  theme: normalizeTheme(p.theme),
  blocks: normalizeBlocks(p.blocks),
  published: p.published,
});

const BLOCK_META: Record<BioBlockType, { label: string; icon: ReactNode; color: string }> = {
  link: { label: "Link button", icon: <IconLink size={16} />, color: "indigo" },
  header: { label: "Header", icon: <IconHeading size={16} />, color: "gray" },
  social: { label: "Social icons", icon: <IconUsersGroup size={16} />, color: "pink" },
  image: { label: "Image", icon: <IconPhoto size={16} />, color: "teal" },
  embed: { label: "YouTube video", icon: <IconBrandYoutube size={16} />, color: "red" },
  text: { label: "Text", icon: <IconTextSize size={16} />, color: "violet" },
};

const newId = () => Math.random().toString(36).slice(2, 10);

function newBlock(type: BioBlockType): BioBlock {
  switch (type) {
    case "link":
      return { id: newId(), type, label: "New link", url: "https://" };
    case "header":
      return { id: newId(), type, label: "Section title" };
    case "social":
      return { id: newId(), type, links: [{ network: "instagram", url: "https://instagram.com/" }] };
    case "image":
      return { id: newId(), type, label: "", imageUrl: "" };
    case "embed":
      return { id: newId(), type, label: "Watch", url: "https://www.youtube.com/watch?v=" };
    case "text":
      return { id: newId(), type, text: "Tell visitors something about you." };
  }
}

export function BioEditor({ pageId }: { pageId: string }) {
  const b = useBrand();
  const router = useRouter();
  const key = `/api/brands/${b.brandId}/bio-pages/${pageId}`;
  const { data, error, mutate } = useSWR<BioPageDto>(key);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<string | null>("content");
  const canEdit = b.can("posts.write");

  useEffect(() => {
    if (data && !draft) {
      const d = toDraft(data);
      setDraft(d);
      setSaved(JSON.stringify(d));
    }
  }, [data, draft]);

  const dirty = !!draft && JSON.stringify(draft) !== saved;
  const check = useSlugCheck(b.brandId, draft?.slug ?? "", pageId);
  const slugOk = !!draft && (draft.slug === data?.slug || check.available);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (error) return <Text c="red">Couldn&apos;t load this bio page.</Text>;
  if (!draft) return <Skeleton h={600} radius="lg" />;

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setTheme = (patch: Partial<BioTheme>) => setDraft((d) => (d ? { ...d, theme: { ...d.theme, ...patch } } : d));
  const setBlock = (id: string, patch: Partial<BioBlock>) =>
    setDraft((d) => (d ? { ...d, blocks: d.blocks.map((x) => (x.id === id ? { ...x, ...patch } : x)) } : d));

  const save = async (extra?: Partial<Draft>) => {
    const next = { ...draft, ...extra };
    setSaving(true);
    try {
      const out = await api<BioPageDto>(key, "PATCH", { ...next, bio: next.bio || null });
      const d = toDraft(out);
      setDraft(d);
      setSaved(JSON.stringify(d));
      void mutate(out, { revalidate: false });
      notifySuccess(extra?.published !== undefined ? (extra.published ? "Your page is live" : "Page unpublished") : "Bio page saved");
    } catch (e) {
      notifyError(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    modals.openConfirmModal({
      title: "Delete bio page?",
      children: <Text size="sm">The address /b/{draft.slug} will stop working and its analytics will be deleted.</Text>,
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await api(key, "DELETE");
          router.push(`/app/${b.brandId}/bio`);
        } catch (e) {
          notifyError(e);
        }
      },
    });

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/b/${data?.slug ?? draft.slug}` : "";

  return (
    <>
      <Group justify="space-between" mb="lg" wrap="wrap" gap="sm">
        <Group gap="sm" wrap="nowrap">
          <ActionIcon variant="default" size="lg" component={Link} href={`/app/${b.brandId}/bio`} aria-label="Back to bio pages">
            <IconArrowLeft size={18} />
          </ActionIcon>
          <div style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap">
              <Text fw={700} fz="xl" truncate>
                {draft.title || "Untitled page"}
              </Text>
              <Badge variant="light" color={data?.published ? "teal" : "gray"}>
                {data?.published ? "Live" : "Draft"}
              </Badge>
            </Group>
            <Group gap={4}>
              <Anchor size="sm" c="dimmed" href={data?.published ? `/b/${data.slug}` : undefined} target="_blank">
                /b/{data?.slug}
              </Anchor>
              <CopyButton value={publicUrl}>
                {({ copied, copy }) => (
                  <ActionIcon variant="subtle" size="sm" color={copied ? "teal" : "gray"} onClick={copy} aria-label="Copy link">
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  </ActionIcon>
                )}
              </CopyButton>
            </Group>
          </div>
        </Group>
        {canEdit && (
          <Group gap="sm">
            <Switch
              label={draft.published ? "Published" : "Unpublished"}
              checked={draft.published}
              onChange={(e) => void save({ published: e.currentTarget.checked })}
              disabled={saving || !slugOk}
            />
            {data?.published && (
              <Button variant="default" leftSection={<IconExternalLink size={16} />} component="a" href={`/b/${data.slug}`} target="_blank">
                View
              </Button>
            )}
            <Button onClick={() => void save()} loading={saving} disabled={!dirty || !slugOk || !draft.title.trim()}>
              {dirty ? "Save changes" : "Saved"}
            </Button>
          </Group>
        )}
      </Group>

      <Grid gutter="xl">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Tabs value={tab} onChange={setTab} keepMounted={false}>
            <Tabs.List mb="md">
              <Tabs.Tab value="content">Content</Tabs.Tab>
              <Tabs.Tab value="design">Design</Tabs.Tab>
              <Tabs.Tab value="settings">Settings</Tabs.Tab>
              <Tabs.Tab value="analytics">Analytics</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="content">
              <ContentTab draft={draft} set={set} setBlock={setBlock} readOnly={!canEdit} />
            </Tabs.Panel>
            <Tabs.Panel value="design">
              <DesignTab theme={draft.theme} setTheme={setTheme} />
            </Tabs.Panel>
            <Tabs.Panel value="settings">
              <Stack>
                <Card withBorder radius="lg" padding="lg">
                  <Stack>
                    <SlugInput slug={draft.slug} onChange={(slug) => set({ slug })} check={draft.slug === data?.slug ? { pending: false, available: true, reason: null } : check} />
                    <Text size="xs" c="dimmed">
                      Changing the address breaks links you&apos;ve already shared.
                    </Text>
                  </Stack>
                </Card>
                {canEdit && (
                  <Card withBorder radius="lg" padding="lg" style={{ borderColor: "var(--mantine-color-red-4)" }}>
                    <Group justify="space-between">
                      <div>
                        <Text fw={600}>Delete this page</Text>
                        <Text size="sm" c="dimmed">
                          Removes the page and all of its analytics.
                        </Text>
                      </div>
                      <Button color="red" variant="light" leftSection={<IconTrash size={16} />} onClick={remove}>
                        Delete
                      </Button>
                    </Group>
                  </Card>
                )}
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="analytics">
              <StatsTab pageId={pageId} blocks={draft.blocks} />
            </Tabs.Panel>
          </Tabs>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Box style={{ position: "sticky", top: 24 }}>
            {FONTS[draft.theme.font]?.google && (
              <link
                rel="stylesheet"
                href={`https://fonts.googleapis.com/css2?family=${FONTS[draft.theme.font]!.google}&display=swap`}
                precedence="default"
              />
            )}
            <PhoneFrame>
              <BioPageView preview title={draft.title} bio={draft.bio} avatarUrl={draft.avatarUrl} theme={draft.theme} blocks={draft.blocks} />
            </PhoneFrame>
            <Group justify="center" mt="sm" gap={6}>
              <IconShare size={14} color="var(--mantine-color-dimmed)" />
              <Text size="xs" c="dimmed">
                Live preview — links are disabled here
              </Text>
            </Group>
          </Box>
        </Grid.Col>
      </Grid>
    </>
  );
}

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <Box
      mx="auto"
      style={{
        width: 340,
        maxWidth: "100%",
        height: 680,
        borderRadius: 48,
        padding: 12,
        background: "linear-gradient(145deg, #1f1f24, #0c0c0f)",
        boxShadow: "0 30px 60px -25px rgba(0,0,0,0.55), inset 0 0 0 2px #2c2c33",
        position: "relative",
      }}
    >
      <Box
        style={{
          position: "absolute",
          top: 22,
          left: "50%",
          transform: "translateX(-50%)",
          width: 96,
          height: 26,
          borderRadius: 20,
          background: "#000",
          zIndex: 2,
        }}
      />
      <Box style={{ width: "100%", height: "100%", borderRadius: 38, overflow: "hidden auto", background: "#fff", scrollbarWidth: "none" }}>
        {children}
      </Box>
    </Box>
  );
}

// ───────────────────────── content ─────────────────────────
interface LogoDto {
  url?: string;
}
interface MediaListDto {
  items: { id: string; url: string; mime: string; alt: string | null }[];
}

function ImagePicker({ value, onChange, label }: { value: string | null | undefined; onChange: (url: string | null) => void; label: string }) {
  const b = useBrand();
  const { data: brand } = useSWR<{ logos?: LogoDto[] }>(`/api/brands/${b.brandId}`);
  const { data: media } = useSWR<MediaListDto>(`/api/brands/${b.brandId}/media?limit=24`);
  const options = useMemo(() => {
    const logos = (Array.isArray(brand?.logos) ? brand.logos : []).map((l) => l.url).filter((u): u is string => !!u);
    const imgs = (media?.items ?? []).filter((m) => m.mime.startsWith("image/")).map((m) => m.url);
    return [...new Set([...logos, ...imgs])];
  }, [brand, media]);
  return (
    <div>
      <Text size="sm" fw={500} mb={6}>
        {label}
      </Text>
      <Group gap={8}>
        {options.slice(0, 14).map((u) => (
          <UnstyledButton
            key={u}
            onClick={() => onChange(u)}
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              overflow: "hidden",
              outline: value === u ? "2px solid var(--mantine-primary-color-filled)" : "1px solid var(--mantine-color-default-border)",
              outlineOffset: value === u ? 2 : 0,
            }}
          >
            <Image src={u} alt="" w={48} h={48} fit="cover" />
          </UnstyledButton>
        ))}
        {value && (
          <Button variant="subtle" size="xs" color="gray" onClick={() => onChange(null)}>
            Remove
          </Button>
        )}
      </Group>
      <TextInput mt={8} size="xs" placeholder="…or paste an image URL" value={value ?? ""} onChange={(e) => onChange(e.currentTarget.value || null)} />
      {options.length === 0 && (
        <Text size="xs" c="dimmed" mt={4}>
          Upload logos on the Brand page or images in the post editor to pick them here.
        </Text>
      )}
    </div>
  );
}

function ContentTab({
  draft,
  set,
  setBlock,
  readOnly,
}: {
  draft: Draft;
  set: (p: Partial<Draft>) => void;
  setBlock: (id: string, p: Partial<BioBlock>) => void;
  readOnly: boolean;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const [expanded, setExpanded] = useState<string | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.blocks.length || from === to) return;
    const next = [...draft.blocks];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x!);
    set({ blocks: next });
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const from = draft.blocks.findIndex((b) => b.id === e.active.id);
    const to = draft.blocks.findIndex((b) => b.id === e.over!.id);
    if (from >= 0 && to >= 0) move(from, to);
  };
  const add = (type: BioBlockType) => {
    const blk = newBlock(type);
    set({ blocks: [...draft.blocks, blk] });
    setExpanded(blk.id);
  };

  return (
    <Stack>
      <Card withBorder radius="lg" padding="lg">
        <Stack>
          <TextInput label="Title" value={draft.title} onChange={(e) => set({ title: e.currentTarget.value })} disabled={readOnly} maxLength={120} />
          <Textarea label="Bio" value={draft.bio} onChange={(e) => set({ bio: e.currentTarget.value })} autosize minRows={2} maxLength={500} disabled={readOnly} />
          <ImagePicker label="Avatar" value={draft.avatarUrl} onChange={(avatarUrl) => set({ avatarUrl })} />
        </Stack>
      </Card>

      <Group justify="space-between">
        <Text fw={600}>Blocks</Text>
        {!readOnly && (
          <Menu shadow="md" position="bottom-end">
            <Menu.Target>
              <Button size="xs" leftSection={<IconPlus size={14} />}>
                Add block
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {(Object.keys(BLOCK_META) as BioBlockType[]).map((t) => (
                <Menu.Item key={t} leftSection={BLOCK_META[t].icon} onClick={() => add(t)}>
                  {BLOCK_META[t].label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <Stack gap="xs">
          {draft.blocks.length === 0 && (
            <Paper withBorder radius="md" p="lg" style={{ borderStyle: "dashed" }}>
              <Text size="sm" c="dimmed" ta="center">
                No blocks yet. Add a link button to get started.
              </Text>
            </Paper>
          )}
          {draft.blocks.map((blk, i) => (
            <SortableBlock key={blk.id} id={blk.id} disabled={readOnly}>
              {(handle) => (
                <BlockCard
                  block={blk}
                  handle={handle}
                  open={expanded === blk.id}
                  onToggle={() => setExpanded(expanded === blk.id ? null : blk.id)}
                  onChange={(p) => setBlock(blk.id, p)}
                  onRemove={() => set({ blocks: draft.blocks.filter((x) => x.id !== blk.id) })}
                  onUp={i > 0 ? () => move(i, i - 1) : undefined}
                  onDown={i < draft.blocks.length - 1 ? () => move(i, i + 1) : undefined}
                  readOnly={readOnly}
                />
              )}
            </SortableBlock>
          ))}
        </Stack>
      </DndContext>
    </Stack>
  );
}

function SortableBlock({ id, disabled, children }: { id: string; disabled: boolean; children: (handle: ReactNode) => ReactNode }) {
  const drag = useDraggable({ id, disabled });
  const drop = useDroppable({ id, disabled });
  const t = drag.transform;
  return (
    <div
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      style={{
        transform: t ? `translate3d(${t.x}px, ${t.y}px, 0)` : undefined,
        zIndex: drag.isDragging ? 10 : undefined,
        position: "relative",
        opacity: drag.isDragging ? 0.9 : 1,
        boxShadow: drop.isOver && !drag.isDragging ? "0 -3px 0 0 var(--mantine-primary-color-filled)" : undefined,
        borderRadius: 12,
      }}
    >
      {children(
        <ActionIcon
          variant="subtle"
          color="gray"
          {...drag.listeners}
          {...drag.attributes}
          style={{ cursor: disabled ? "default" : drag.isDragging ? "grabbing" : "grab", touchAction: "none" }}
          aria-label="Drag to reorder"
        >
          <IconGripVertical size={16} />
        </ActionIcon>,
      )}
    </div>
  );
}

function blockSummary(b: BioBlock): string {
  switch (b.type) {
    case "link":
      return b.label || b.url || "Link";
    case "header":
      return b.label || "Header";
    case "social":
      return (b.links ?? []).map((l) => SOCIAL_NETWORKS.find((n) => n.value === l.network)?.label ?? l.network).join(" · ") || "No icons";
    case "image":
      return b.label || (b.imageUrl ? "Image" : "No image selected");
    case "embed":
      return youtubeId(b.url) ? b.label || "YouTube video" : "Paste a YouTube link";
    case "text":
      return (b.text ?? "").slice(0, 60) || "Text";
  }
}

function BlockCard({
  block,
  handle,
  open,
  onToggle,
  onChange,
  onRemove,
  onUp,
  onDown,
  readOnly,
}: {
  block: BioBlock;
  handle: ReactNode;
  open: boolean;
  onToggle: () => void;
  onChange: (p: Partial<BioBlock>) => void;
  onRemove: () => void;
  onUp?: () => void;
  onDown?: () => void;
  readOnly: boolean;
}) {
  const meta = BLOCK_META[block.type];
  return (
    <Paper withBorder radius="md" p="xs" bg="var(--mantine-color-body)" style={{ opacity: block.hidden ? 0.6 : 1 }}>
      <Group gap="xs" wrap="nowrap">
        {handle}
        <ThemeIcon variant="light" color={meta.color} size={30} radius="md">
          {meta.icon}
        </ThemeIcon>
        <UnstyledButton onClick={onToggle} style={{ flex: 1, minWidth: 0 }}>
          <Text size="xs" c="dimmed">
            {meta.label}
          </Text>
          <Text size="sm" fw={500} truncate>
            {blockSummary(block)}
          </Text>
        </UnstyledButton>
        {!readOnly && (
          <Group gap={2} wrap="nowrap">
            <ActionIcon variant="subtle" color="gray" onClick={onUp} disabled={!onUp} aria-label="Move up">
              <IconChevronUp size={16} />
            </ActionIcon>
            <ActionIcon variant="subtle" color="gray" onClick={onDown} disabled={!onDown} aria-label="Move down">
              <IconChevronDown size={16} />
            </ActionIcon>
            <Tooltip label={block.hidden ? "Show" : "Hide"}>
              <ActionIcon variant="subtle" color="gray" onClick={() => onChange({ hidden: !block.hidden })}>
                {block.hidden ? <IconEyeOff size={16} /> : <IconEye size={16} />}
              </ActionIcon>
            </Tooltip>
            <ActionIcon variant="subtle" color="red" onClick={onRemove} aria-label="Remove block">
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        )}
      </Group>
      {open && !readOnly && (
        <Stack gap="sm" mt="sm" px="xs" pb="xs">
          {(block.type === "link" || block.type === "header" || block.type === "embed" || block.type === "image") && (
            <TextInput
              label={block.type === "image" ? "Caption / alt text" : block.type === "embed" ? "Title" : block.type === "header" ? "Heading" : "Button label"}
              value={block.label ?? ""}
              onChange={(e) => onChange({ label: e.currentTarget.value })}
            />
          )}
          {(block.type === "link" || block.type === "embed" || block.type === "image") && (
            <TextInput
              label={block.type === "embed" ? "YouTube URL" : block.type === "image" ? "Link when tapped (optional)" : "URL"}
              value={block.url ?? ""}
              onChange={(e) => onChange({ url: e.currentTarget.value })}
              error={block.type === "embed" && block.url && !youtubeId(block.url) ? "Paste a youtube.com or youtu.be link" : undefined}
            />
          )}
          {block.type === "image" && <ImagePicker label="Image" value={block.imageUrl} onChange={(u) => onChange({ imageUrl: u ?? "" })} />}
          {block.type === "text" && <Textarea label="Text" value={block.text ?? ""} onChange={(e) => onChange({ text: e.currentTarget.value })} autosize minRows={2} />}
          {block.type === "social" && (
            <Stack gap={6}>
              {(block.links ?? []).map((l, i) => (
                <Group key={i} gap={6} wrap="nowrap">
                  <Select
                    data={SOCIAL_NETWORKS}
                    value={l.network}
                    onChange={(v) => onChange({ links: (block.links ?? []).map((x, j) => (j === i ? { ...x, network: v ?? "website" } : x)) })}
                    w={140}
                    allowDeselect={false}
                  />
                  <TextInput
                    style={{ flex: 1 }}
                    value={l.url}
                    onChange={(e) => onChange({ links: (block.links ?? []).map((x, j) => (j === i ? { ...x, url: e.currentTarget.value } : x)) })}
                  />
                  <ActionIcon variant="subtle" color="red" onClick={() => onChange({ links: (block.links ?? []).filter((_, j) => j !== i) })}>
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              ))}
              <Button
                variant="light"
                size="xs"
                leftSection={<IconPlus size={14} />}
                onClick={() => onChange({ links: [...(block.links ?? []), { network: "website", url: "https://" }] })}
                style={{ alignSelf: "flex-start" }}
              >
                Add icon
              </Button>
            </Stack>
          )}
        </Stack>
      )}
    </Paper>
  );
}

// ───────────────────────── design ─────────────────────────
function DesignTab({ theme, setTheme }: { theme: BioTheme; setTheme: (p: Partial<BioTheme>) => void }) {
  return (
    <Stack>
      <Card withBorder radius="lg" padding="lg">
        <Text fw={600} mb="sm">
          Background
        </Text>
        <SimpleGrid cols={{ base: 3, sm: 5 }} spacing="sm">
          {BACKGROUND_PRESETS.map((p) => {
            const active = theme.background.value === p.value;
            return (
              <UnstyledButton key={p.name} onClick={() => setTheme({ background: { type: p.type, value: p.value } })}>
                <Box
                  h={64}
                  style={{
                    background: p.value,
                    borderRadius: 12,
                    outline: active ? "2px solid var(--mantine-primary-color-filled)" : "1px solid var(--mantine-color-default-border)",
                    outlineOffset: active ? 2 : 0,
                  }}
                />
                <Text size="xs" ta="center" mt={4} c={active ? undefined : "dimmed"} fw={active ? 600 : 400}>
                  {p.name}
                </Text>
              </UnstyledButton>
            );
          })}
        </SimpleGrid>
        <ColorInput
          mt="md"
          label="Custom solid color"
          value={theme.background.type === "solid" ? theme.background.value : ""}
          placeholder="#FAF8F5"
          onChangeEnd={(v) => v && setTheme({ background: { type: "solid", value: v } })}
        />
      </Card>
      <Card withBorder radius="lg" padding="lg">
        <Stack>
          <div>
            <Text fw={600} mb="xs">
              Button style
            </Text>
            <SegmentedControl
              fullWidth
              value={theme.buttonStyle}
              onChange={(v) => setTheme({ buttonStyle: v as ButtonStyle })}
              data={[
                { value: "filled", label: "Filled" },
                { value: "outline", label: "Outline" },
                { value: "soft", label: "Soft" },
                { value: "pill", label: "Pill" },
              ]}
            />
          </div>
          <ColorInput
            label="Accent color"
            description="Used for buttons"
            value={theme.accent}
            onChange={(accent) => /^#[0-9a-f]{6}$/i.test(accent) && setTheme({ accent })}
            swatches={["#3B2416", "#C8875A", "#7A9E7E", "#E2A33B", "#4C6EF5", "#7950F2", "#E64980", "#12B886", "#111111", "#FFFFFF"]}
            format="hex"
          />
          <Select
            label="Font"
            value={theme.font}
            onChange={(v) => v && setTheme({ font: v as BioFont })}
            data={(Object.keys(FONTS) as BioFont[]).map((f) => ({ value: f, label: FONTS[f].label }))}
            allowDeselect={false}
          />
        </Stack>
      </Card>
    </Stack>
  );
}

// ───────────────────────── analytics ─────────────────────────
interface StatsDto {
  views: number;
  clicks: number;
  ctr: number;
  series: { date: string; views: number; clicks: number }[];
  blocks: { blockId: string; clicks: number }[];
  referrers: { referrer: string; views: number }[];
}

function StatsTab({ pageId, blocks }: { pageId: string; blocks: BioBlock[] }) {
  const b = useBrand();
  const { data } = useSWR<StatsDto>(`/api/brands/${b.brandId}/bio-pages/${pageId}/stats?days=30`);
  if (!data) return <Skeleton h={360} radius="lg" />;
  const name = (id: string) => {
    const blk = blocks.find((x) => x.id === id);
    return blk ? blockSummary(blk) : "Removed block";
  };
  return (
    <Stack>
      <SimpleGrid cols={3}>
        {[
          ["Views", data.views.toLocaleString()],
          ["Clicks", data.clicks.toLocaleString()],
          ["Click-through", `${(data.ctr * 100).toFixed(1)}%`],
        ].map(([l, v]) => (
          <Card key={l} withBorder radius="lg" padding="md">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              {l}
            </Text>
            <Text fz={24} fw={700}>
              {v}
            </Text>
            <Text size="xs" c="dimmed">
              last 30 days
            </Text>
          </Card>
        ))}
      </SimpleGrid>
      <Card withBorder radius="lg" padding="lg">
        <Text fw={600} mb="sm">
          Views & clicks
        </Text>
        <TrendAreaChart
          h={220}
          data={data.series.map((d) => ({ ...d, label: dayjs(d.date).format("MMM D") }))}
          dataKey="label"
          series={[
            { name: "views", label: "Views", color: "indigo.5" },
            { name: "clicks", label: "Clicks", color: "teal.5" },
          ]}
        />
      </Card>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Card withBorder radius="lg" padding={0}>
          <Text fw={600} p="md" pb={4}>
            Clicks by block
          </Text>
          <Table verticalSpacing={6} horizontalSpacing="md">
            <Table.Tbody>
              {data.blocks.length === 0 ? (
                <Table.Tr>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      No clicks yet
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                data.blocks.map((r) => (
                  <Table.Tr key={r.blockId}>
                    <Table.Td>
                      <Text size="sm" truncate maw={200}>
                        {name(r.blockId)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" fw={600}>
                        {r.clicks.toLocaleString()}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right" w={70}>
                      <Text size="xs" c="dimmed">
                        {data.views ? `${((r.clicks / data.views) * 100).toFixed(1)}%` : "—"}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Card>
        <Card withBorder radius="lg" padding={0}>
          <Text fw={600} p="md" pb={4}>
            Top referrers
          </Text>
          <Table verticalSpacing={6} horizontalSpacing="md">
            <Table.Tbody>
              {data.referrers.map((r) => (
                <Table.Tr key={r.referrer}>
                  <Table.Td>
                    <Text size="sm">{r.referrer}</Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" fw={600}>
                      {r.views.toLocaleString()}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}

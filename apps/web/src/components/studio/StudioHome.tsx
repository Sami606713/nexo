"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWRInfinite from "swr/infinite";
import {
  ActionIcon,
  AspectRatio,
  Badge,
  Box,
  Button,
  Card,
  Chip,
  Group,
  Image,
  Menu,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue, useElementSize } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import {
  IconChevronDown,
  IconCopy,
  IconDots,
  IconEdit,
  IconPalette,
  IconPlus,
  IconSearch,
  IconTrash,
  IconWand,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { api } from "@/lib/fetcher";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { notifyError } from "@/components/ui/notify";
import { canvasSrc } from "./client";
import { FORMATS, formatLabel, orientationOf, type Orientation } from "./scene";
import { TEMPLATES, TEMPLATE_CATEGORIES, instantiateTemplate, templateOrientation, type StudioTemplate } from "./templates";
import { StudioStyles } from "./StudioStyles";

dayjs.extend(relativeTime);

const ScenePreview = dynamic(() => import("./canvas/ScenePreview"), { ssr: false });

interface DesignItem {
  id: string;
  name: string;
  format: string;
  width: number;
  height: number;
  previewUrl: string | null;
  updatedAt: string;
}
type Page = { items: DesignItem[]; nextCursor: string | null };

function FluidPreview({ scene, ratio }: { scene: StudioTemplate["scene"]; ratio: number }) {
  const { ref, width } = useElementSize();
  return (
    <AspectRatio ratio={ratio} ref={ref}>
      <Box>{width > 0 ? <ScenePreview scene={scene} width={Math.floor(width)} /> : <Skeleton h="100%" />}</Box>
    </AspectRatio>
  );
}

function FormatIcon({ w, h }: { w: number; h: number }) {
  const r = w / h;
  return <Box w={r >= 1 ? 16 : 16 * r} h={r >= 1 ? 16 / r : 16} style={{ border: "1.5px solid currentColor", borderRadius: 3 }} />;
}

export function StudioHome({ brandId, brandColors, canEdit }: { brandId: string; brandColors: string[]; canEdit: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [useBrand, setUseBrand] = useState(brandColors.length > 0);

  const create = async (body: Record<string, unknown>, key: string) => {
    setCreating(key);
    try {
      const d = await api<{ id: string }>(`/api/brands/${brandId}/designs`, "POST", body);
      router.push(`/app/${brandId}/studio/${d.id}`);
    } catch (err) {
      notifyError(err);
      setCreating(null);
    }
  };

  return (
    <>
      <StudioStyles />
      <PageHeader
        title="Studio"
        description="Design on-brand graphics for every network — then drop them straight into a post."
        actions={
          canEdit && (
            <Menu position="bottom-end" shadow="lg" width={260}>
              <Menu.Target>
                <Button leftSection={<IconPlus size={16} />} rightSection={<IconChevronDown size={14} />} loading={creating === "blank"}>
                  New design
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Blank canvas</Menu.Label>
                {FORMATS.map((f) => (
                  <Menu.Item
                    key={f.key}
                    leftSection={<FormatIcon w={f.width} h={f.height} />}
                    rightSection={
                      <Text size="xs" c="dimmed">
                        {f.width}×{f.height}
                      </Text>
                    }
                    onClick={() => create({ format: f.key }, "blank")}
                  >
                    {f.label}
                  </Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Item leftSection={<IconEdit size={16} />} onClick={() => setCustomOpen(true)}>
                  Custom size…
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )
        }
      />

      <QuickStart onPick={(f) => create({ format: f }, `quick-${f}`)} creating={creating} disabled={!canEdit} />

      <RecentDesigns brandId={brandId} canEdit={canEdit} />

      <TemplateGallery
        brandColors={brandColors}
        useBrand={useBrand}
        setUseBrand={setUseBrand}
        creating={creating}
        disabled={!canEdit}
        onPick={(t) => create({ templateId: t.id, format: t.format, useBrandColors: useBrand }, t.id)}
      />

      <CustomSizeModal opened={customOpen} onClose={() => setCustomOpen(false)} onCreate={(w, h) => create({ format: "custom", width: w, height: h }, "blank")} />
    </>
  );
}

function QuickStart({ onPick, creating, disabled }: { onPick: (format: string) => void; creating: string | null; disabled: boolean }) {
  const picks = ["instagram_post", "instagram_portrait", "instagram_story", "linkedin_post", "x_post", "youtube_thumbnail"];
  return (
    <SimpleGrid cols={{ base: 3, sm: 6 }} spacing="sm" mb="xl">
      {picks.map((k) => {
        const f = FORMATS.find((x) => x.key === k)!;
        const r = f.width / f.height;
        return (
          <UnstyledButton key={k} onClick={() => onPick(k)} disabled={disabled || !!creating} className="studio-card" aria-label={`New ${f.label}`}>
            <Paper withBorder radius="lg" p="sm" h="100%">
              <Box h={64} style={{ display: "grid", placeItems: "center" }}>
                <Box
                  w={r >= 1 ? 58 : 58 * r}
                  h={r >= 1 ? 58 / r : 58}
                  style={{
                    borderRadius: 8,
                    background: "linear-gradient(135deg, var(--mantine-color-indigo-4), var(--mantine-color-violet-5))",
                    opacity: creating === `quick-${k}` ? 0.4 : 1,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <IconPlus size={18} color="white" />
                </Box>
              </Box>
              <Text size="xs" fw={700} ta="center" mt={6} truncate>
                {f.label}
              </Text>
              <Text size="10px" c="dimmed" ta="center">
                {f.width}×{f.height}
              </Text>
            </Paper>
          </UnstyledButton>
        );
      })}
    </SimpleGrid>
  );
}

function RecentDesigns({ brandId, canEdit }: { brandId: string; canEdit: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [dq] = useDebouncedValue(q, 300);
  const { data, isLoading, size, setSize, mutate } = useSWRInfinite<Page>(
    (i, prev: Page | null) => {
      if (prev && !prev.nextCursor) return null;
      return `/api/brands/${brandId}/designs?limit=12&q=${encodeURIComponent(dq)}${prev?.nextCursor ? `&cursor=${prev.nextCursor}` : ""}`;
    },
    { revalidateOnMount: true },
  );
  const items = (data ?? []).flatMap((p) => p.items);
  const hasMore = !!data?.[data.length - 1]?.nextCursor;

  const rename = (d: DesignItem) => {
    let value = d.name;
    modals.openConfirmModal({
      title: "Rename design",
      children: <TextInput data-autofocus defaultValue={d.name} onChange={(e) => (value = e.currentTarget.value)} maxLength={120} />,
      labels: { confirm: "Save", cancel: "Cancel" },
      onConfirm: async () => {
        try {
          await api(`/api/brands/${brandId}/designs/${d.id}`, "PATCH", { name: value.trim() || d.name });
          void mutate();
        } catch (err) {
          notifyError(err);
        }
      },
    });
  };
  const duplicate = async (d: DesignItem) => {
    try {
      await api(`/api/brands/${brandId}/designs/${d.id}/duplicate`, "POST");
      void mutate();
    } catch (err) {
      notifyError(err);
    }
  };
  const remove = (d: DesignItem) =>
    modals.openConfirmModal({
      title: "Delete design?",
      children: <Text size="sm">“{d.name}” will be deleted. Images you already exported stay in your media library.</Text>,
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await api(`/api/brands/${brandId}/designs/${d.id}`, "DELETE");
          void mutate();
        } catch (err) {
          notifyError(err);
        }
      },
    });

  if (!isLoading && !items.length && !dq) return null;

  return (
    <Box mb={40}>
      <Group justify="space-between" mb="sm">
        <Title order={4}>Recent designs</Title>
        <TextInput size="xs" w={220} placeholder="Search designs" leftSection={<IconSearch size={14} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
      </Group>
      {!isLoading && !items.length && (
        <Text size="sm" c="dimmed">
          No designs match “{dq}”.
        </Text>
      )}
      <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 6 }} spacing="md">
        {isLoading && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={200} radius="lg" />)}
        {items.map((d) => (
          <Card key={d.id} withBorder radius="lg" p={0} className="studio-card" style={{ cursor: "pointer" }} onClick={() => router.push(`/app/${brandId}/studio/${d.id}`)}>
            <Box className="studio-checker" style={{ aspectRatio: "1", display: "grid", placeItems: "center", padding: 12, position: "relative" }}>
              {d.previewUrl ? (
                <Image src={canvasSrc(d.previewUrl)} alt={d.name} fit="contain" mah="100%" maw="100%" radius="sm" style={{ boxShadow: "0 2px 10px rgba(0,0,0,.12)" }} />
              ) : (
                <Box
                  w={d.width >= d.height ? "80%" : `${(80 * d.width) / d.height}%`}
                  style={{ aspectRatio: `${d.width}/${d.height}`, background: "var(--mantine-color-default)", borderRadius: 6, boxShadow: "0 2px 10px rgba(0,0,0,.08)" }}
                />
              )}
              {canEdit && (
                <Box className="studio-card-actions" style={{ position: "absolute", top: 8, right: 8 }} onClick={(e) => e.stopPropagation()}>
                  <Menu position="bottom-end" shadow="md" withinPortal>
                    <Menu.Target>
                      <ActionIcon variant="default" radius="xl" aria-label="Design actions">
                        <IconDots size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconEdit size={15} />} onClick={() => rename(d)}>
                        Rename
                      </Menu.Item>
                      <Menu.Item leftSection={<IconCopy size={15} />} onClick={() => duplicate(d)}>
                        Duplicate
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Item color="red" leftSection={<IconTrash size={15} />} onClick={() => remove(d)}>
                        Delete
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Box>
              )}
            </Box>
            <Stack gap={0} p="sm">
              <Text size="sm" fw={600} truncate>
                {d.name}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {formatLabel(d.format, d.width, d.height)} · {dayjs(d.updatedAt).fromNow()}
              </Text>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
      {hasMore && (
        <Group justify="center" mt="md">
          <Button variant="subtle" onClick={() => setSize(size + 1)}>
            Show more
          </Button>
        </Group>
      )}
    </Box>
  );
}

const ORIENTATIONS: { value: "all" | Orientation; label: string }[] = [
  { value: "all", label: "All" },
  { value: "square", label: "Square" },
  { value: "portrait", label: "Portrait" },
  { value: "story", label: "Story" },
  { value: "landscape", label: "Landscape" },
];

function TemplateGallery({
  brandColors,
  useBrand,
  setUseBrand,
  onPick,
  creating,
  disabled,
}: {
  brandColors: string[];
  useBrand: boolean;
  setUseBrand: (v: boolean) => void;
  onPick: (t: StudioTemplate) => void;
  creating: string | null;
  disabled: boolean;
}) {
  const [cat, setCat] = useState("all");
  const [orient, setOrient] = useState<string>("all");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return TEMPLATES.filter((t) => (cat === "all" || t.category === cat) && (orient === "all" || templateOrientation(t) === orient)).filter(
      (t) => !s || t.name.toLowerCase().includes(s) || t.tags.some((x) => x.includes(s)) || t.category.includes(s),
    );
  }, [cat, orient, q]);
  const scenes = useMemo(() => new Map(list.map((t) => [t.id, useBrand ? instantiateTemplate(t, brandColors) : t.scene])), [list, useBrand, brandColors]);

  return (
    <Box mb="xl">
      <Group justify="space-between" mb="sm" align="flex-end">
        <Stack gap={2}>
          <Title order={4}>Templates</Title>
          <Text size="sm" c="dimmed">
            {TEMPLATES.length} original layouts. Pick one, then make it yours.
          </Text>
        </Stack>
        <Group gap="sm">
          <Switch
            label={
              <Group gap={6}>
                <IconPalette size={15} />
                <span>Use brand colors</span>
                {brandColors.slice(0, 4).map((c) => (
                  <Box key={c} w={12} h={12} style={{ borderRadius: 3, background: c }} />
                ))}
              </Group>
            }
            checked={useBrand}
            disabled={!brandColors.length}
            onChange={(e) => setUseBrand(e.currentTarget.checked)}
          />
          <TextInput size="xs" w={200} placeholder="Search templates" leftSection={<IconSearch size={14} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
        </Group>
      </Group>
      <Group justify="space-between" mb="md" gap="sm">
        <Chip.Group value={cat} onChange={(v) => setCat(v as string)}>
          <Group gap={6}>
            <Chip size="sm" value="all">
              All
            </Chip>
            {TEMPLATE_CATEGORIES.map((c) => (
              <Chip key={c.value} size="sm" value={c.value}>
                {c.label}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
        <SegmentedControl size="xs" value={orient} onChange={setOrient} data={ORIENTATIONS} />
      </Group>
      {list.length === 0 ? (
        <EmptyState icon={<IconWand size={28} />} title="No templates found" description="Try another category, format or search term." />
      ) : (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="md">
          {list.map((t) => {
            const f = FORMATS.find((x) => x.key === t.format);
            return (
              <UnstyledButton key={t.id} onClick={() => onPick(t)} disabled={disabled || !!creating} className="studio-card" style={{ borderRadius: 14 }} aria-label={`Use template ${t.name}`}>
                <Paper withBorder radius="lg" style={{ overflow: "hidden", opacity: creating === t.id ? 0.5 : 1 }}>
                  <Box className="studio-checker" p="sm">
                    <Box style={{ borderRadius: 8, overflow: "hidden", boxShadow: "0 4px 14px rgba(0,0,0,.12)" }}>
                      <FluidPreview scene={scenes.get(t.id) ?? t.scene} ratio={t.scene.width / t.scene.height} />
                    </Box>
                  </Box>
                  <Stack gap={2} p="sm">
                    <Text size="sm" fw={600} truncate>
                      {t.name}
                    </Text>
                    <Group gap={6}>
                      <Badge size="xs" variant="light">
                        {TEMPLATE_CATEGORIES.find((c) => c.value === t.category)?.label}
                      </Badge>
                      <Text size="xs" c="dimmed">
                        {f?.label ?? orientationOf(t.scene.width, t.scene.height)}
                      </Text>
                    </Group>
                  </Stack>
                </Paper>
              </UnstyledButton>
            );
          })}
        </SimpleGrid>
      )}
    </Box>
  );
}

function CustomSizeModal({ opened, onClose, onCreate }: { opened: boolean; onClose: () => void; onCreate: (w: number, h: number) => void }) {
  const [w, setW] = useState(1080);
  const [h, setH] = useState(1080);
  const ok = w >= 50 && h >= 50 && w <= 8000 && h <= 8000;
  return (
    <Modal opened={opened} onClose={onClose} title="Custom size" centered size="sm">
      <Group grow>
        <NumberInput label="Width" suffix=" px" value={w} onChange={(v) => setW(Number(v) || 0)} min={50} max={8000} data-autofocus />
        <NumberInput label="Height" suffix=" px" value={h} onChange={(v) => setH(Number(v) || 0)} min={50} max={8000} />
      </Group>
      <Text size="xs" c="dimmed" mt="xs">
        Between 50 and 8000 px on each side.
      </Text>
      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!ok}
          onClick={() => {
            onClose();
            onCreate(Math.round(w), Math.round(h));
          }}
        >
          Create design
        </Button>
      </Group>
    </Modal>
  );
}

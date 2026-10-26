"use client";

import { useState } from "react";
import useSWRInfinite from "swr/infinite";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Image,
  Loader,
  Modal,
  Paper,
  Popover,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { DndContext, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { IconGripVertical, IconPhoto, IconPhotoPlus, IconSparkles, IconTrash, IconUpload, IconVideo, IconX, IconAlt } from "@tabler/icons-react";
import type { Network } from "@postline/core";
import { api } from "@/lib/fetcher";
import type { MediaDTO } from "@/lib/posts/types";
import { notifyError, uploadMedia } from "@/components/posts/utils";
import { AiImageModal } from "./AiImageModal";

const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime"];
const MB = 1024 * 1024;

interface Props {
  brandId: string;
  media: MediaDTO[];
  /** Functional update so concurrent uploads don't clobber each other. */
  onChange: (fn: (cur: MediaDTO[]) => MediaDTO[]) => void;
  readOnly?: boolean;
  /** Used to prefill the AI image prompt. */
  caption?: string;
  /** Selected networks, to suggest image sizes. */
  networks?: Network[];
}

function MediaThumb({ m, size = 104 }: { m: MediaDTO; size?: number }) {
  return m.mime.startsWith("video/") ? (
    <Box w={size} h={size} style={{ borderRadius: 8, overflow: "hidden", background: "black", position: "relative" }}>
      <video src={m.url} muted preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <IconVideo size={16} color="white" style={{ position: "absolute", left: 6, bottom: 6 }} />
    </Box>
  ) : (
    <Image src={m.url} alt={m.alt ?? ""} w={size} h={size} radius="md" fit="cover" />
  );
}

function AltEditor({ brandId, m, onSaved }: { brandId: string; m: MediaDTO; onSaved: (m: MediaDTO) => void }) {
  const [opened, setOpened] = useState(false);
  const [value, setValue] = useState(m.alt ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <Popover opened={opened} onChange={setOpened} width={280} withArrow shadow="md" trapFocus>
      <Popover.Target>
        <Tooltip label={m.alt ? `Alt: ${m.alt}` : "Add alt text"}>
          <ActionIcon size="sm" variant={m.alt ? "filled" : "default"} radius="xl" aria-label="Edit alt text" onClick={() => setOpened((o) => !o)}>
            <IconAlt size={14} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Textarea
            label="Alt text"
            description="Describe the image for people using screen readers."
            autosize
            minRows={2}
            maxLength={1000}
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              size="xs"
              loading={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const updated = await api<MediaDTO>(`/api/brands/${brandId}/media/${m.id}`, "PATCH", { alt: value || null });
                  onSaved(updated);
                  setOpened(false);
                } catch (err) {
                  notifyError(err, brandId);
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function SortableItem({ m, index, children }: { m: MediaDTO; index: number; children: React.ReactNode }) {
  const drag = useDraggable({ id: m.id, data: { index } });
  const drop = useDroppable({ id: m.id, data: { index } });
  const style: React.CSSProperties = {
    position: "relative",
    opacity: drag.isDragging ? 0.4 : 1,
    transform: drag.transform ? `translate(${drag.transform.x}px, ${drag.transform.y}px)` : undefined,
    zIndex: drag.isDragging ? 10 : undefined,
    outline: drop.isOver && !drag.isDragging ? "2px dashed var(--mantine-primary-color-filled)" : undefined,
    borderRadius: 8,
  };
  return (
    <div ref={drop.setNodeRef} style={{ borderRadius: 8 }}>
      <div ref={drag.setNodeRef} style={style}>
        <ActionIcon
          {...drag.listeners}
          {...drag.attributes}
          size="sm"
          variant="default"
          radius="xl"
          aria-label={`Drag to reorder (position ${index + 1})`}
          style={{ position: "absolute", left: 4, top: 4, zIndex: 2, cursor: "grab" }}
        >
          <IconGripVertical size={14} />
        </ActionIcon>
        {children}
      </div>
    </div>
  );
}

function LibraryModal({ brandId, opened, onClose, onPick, exclude }: { brandId: string; opened: boolean; onClose: () => void; onPick: (m: MediaDTO) => void; exclude: string[] }) {
  const { data, size, setSize, isLoading } = useSWRInfinite<{ items: MediaDTO[]; nextCursor: string | null }>(
    (i, prev) => (!opened ? null : i === 0 ? `/api/brands/${brandId}/media?limit=24` : prev?.nextCursor ? `/api/brands/${brandId}/media?limit=24&cursor=${prev.nextCursor}` : null),
  );
  const items = (data ?? []).flatMap((p) => p.items);
  const hasMore = !!data?.[data.length - 1]?.nextCursor;
  return (
    <Modal opened={opened} onClose={onClose} title="Media library" size="lg">
      {isLoading && <Loader size="sm" />}
      {!isLoading && !items.length && (
        <Text size="sm" c="dimmed">
          No uploads yet.
        </Text>
      )}
      <SimpleGrid cols={{ base: 3, sm: 4 }} spacing="xs">
        {items.map((m) => {
          const used = exclude.includes(m.id);
          return (
            <Box
              key={m.id}
              component="button"
              type="button"
              disabled={used}
              onClick={() => onPick(m)}
              aria-label={used ? "Already attached" : "Attach this file"}
              style={{ border: 0, padding: 0, background: "none", cursor: used ? "default" : "pointer", opacity: used ? 0.4 : 1 }}
            >
              <MediaThumb m={m} size={120} />
            </Box>
          );
        })}
      </SimpleGrid>
      {hasMore && (
        <Group justify="center" mt="md">
          <Button variant="default" size="xs" onClick={() => setSize(size + 1)}>
            Load more
          </Button>
        </Group>
      )}
    </Modal>
  );
}

export function MediaSection({ brandId, media, onChange, readOnly, caption, networks }: Props) {
  const [uploading, setUploading] = useState<string[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));

  async function onDrop(files: File[]) {
    for (const f of files) {
      setUploading((u) => [...u, f.name]);
      try {
        const m = await uploadMedia(brandId, f);
        onChange((cur) => [...cur, m]);
      } catch (err) {
        notifyError(err, brandId, `Couldn't upload ${f.name}`);
      } finally {
        setUploading((u) => u.filter((n) => n !== f.name));
      }
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const from = e.active.data.current?.index as number | undefined;
    const to = e.over?.data.current?.index as number | undefined;
    if (from == null || to == null || from === to) return;
    onChange((cur) => {
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      return next;
    });
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Group gap="xs">
            <Text fw={600}>Media</Text>
            {media.length > 0 && <Badge variant="light">{media.length}</Badge>}
          </Group>
          {!readOnly && (
            <Group gap={4}>
              <Button size="compact-sm" variant="light" color="violet" leftSection={<IconSparkles size={14} />} onClick={() => setAiOpen(true)}>
                Generate with AI
              </Button>
              <Button size="compact-sm" variant="subtle" leftSection={<IconPhoto size={14} />} onClick={() => setLibraryOpen(true)}>
                From library
              </Button>
            </Group>
          )}
        </Group>

        {media.length > 0 && (
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <Group gap="sm">
              {media.map((m, i) =>
                readOnly ? (
                  <MediaThumb key={m.id} m={m} />
                ) : (
                  <SortableItem key={m.id} m={m} index={i}>
                    <MediaThumb m={m} />
                    <Group gap={4} style={{ position: "absolute", right: 4, top: 4, zIndex: 2 }}>
                      {m.mime.startsWith("image/") && (
                        <AltEditor brandId={brandId} m={m} onSaved={(u) => onChange((cur) => cur.map((x) => (x.id === u.id ? u : x)))} />
                      )}
                      <ActionIcon size="sm" variant="filled" color="dark" radius="xl" aria-label="Remove media" onClick={() => onChange((cur) => cur.filter((x) => x.id !== m.id))}>
                        <IconTrash size={13} />
                      </ActionIcon>
                    </Group>
                  </SortableItem>
                ),
              )}
              {uploading.map((n) => (
                <Paper key={n} withBorder w={104} h={104} radius="md" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Loader size="sm" aria-label={`Uploading ${n}`} />
                </Paper>
              ))}
            </Group>
          </DndContext>
        )}
        {media.length === 0 && uploading.length > 0 && <Loader size="sm" />}

        {!readOnly && (
          <Dropzone
            onDrop={onDrop}
            onReject={(rej) => notifyError(new Error(rej[0]?.errors[0]?.message ?? "File not accepted"))}
            accept={ACCEPT}
            maxSize={200 * MB}
            radius="md"
            p="md"
          >
            <Group justify="center" gap="sm" mih={56} style={{ pointerEvents: "none" }}>
              <Dropzone.Accept>
                <IconUpload size={28} color="var(--mantine-primary-color-filled)" />
              </Dropzone.Accept>
              <Dropzone.Reject>
                <IconX size={28} color="var(--mantine-color-red-6)" />
              </Dropzone.Reject>
              <Dropzone.Idle>
                <IconPhotoPlus size={28} color="var(--mantine-color-dimmed)" />
              </Dropzone.Idle>
              <div>
                <Text size="sm" fw={500}>
                  Drag images or videos here, or click to browse
                </Text>
                <Text size="xs" c="dimmed">
                  JPEG, PNG, WebP, GIF up to 20 MB · MP4, MOV up to 200 MB
                </Text>
              </div>
            </Group>
          </Dropzone>
        )}
      </Stack>
      <AiImageModal
        brandId={brandId}
        opened={aiOpen}
        onClose={() => setAiOpen(false)}
        caption={caption}
        networks={networks}
        onAdd={(added) => onChange((cur) => [...cur, ...added.filter((m) => !cur.some((x) => x.id === m.id))])}
      />
      <LibraryModal
        brandId={brandId}
        opened={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        exclude={media.map((m) => m.id)}
        onPick={(m) => {
          onChange((cur) => [...cur, m]);
          setLibraryOpen(false);
        }}
      />
    </Paper>
  );
}

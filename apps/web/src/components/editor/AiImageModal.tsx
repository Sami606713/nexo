"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Group,
  Image,
  Modal,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  Textarea,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconCheck, IconRefresh, IconSparkles } from "@tabler/icons-react";
import { CREDIT_COST, type Network } from "@postline/core";
import { api } from "@/lib/fetcher";
import type { MediaDTO } from "@/lib/posts/types";
import { notifyError } from "@/components/posts/utils";

export type ImageStyle = "photo" | "illustration" | "3d" | "minimal" | "brand";

export interface SizePreset {
  id: string;
  label: string;
  width: number;
  height: number;
  networks: Network[];
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: "square", label: "Square", width: 1080, height: 1080, networks: ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "LINKEDIN_PAGE", "X", "THREADS", "BLUESKY", "MASTODON", "TELEGRAM", "DISCORD", "SLACK", "GOOGLE_BUSINESS", "CUSTOM_WEBHOOK"] },
  { id: "portrait", label: "Portrait 4:5", width: 1080, height: 1350, networks: ["INSTAGRAM", "FACEBOOK", "THREADS", "LINKEDIN", "LINKEDIN_PAGE"] },
  { id: "landscape", label: "Landscape 16:9", width: 1200, height: 675, networks: ["X", "LINKEDIN", "LINKEDIN_PAGE", "FACEBOOK", "BLUESKY", "MASTODON", "TELEGRAM", "DISCORD", "SLACK", "YOUTUBE"] },
  { id: "story", label: "Story 9:16", width: 1080, height: 1920, networks: ["INSTAGRAM", "TIKTOK", "FACEBOOK", "YOUTUBE"] },
  { id: "pin", label: "Pin 2:3", width: 1000, height: 1500, networks: ["PINTEREST"] },
];

export const STYLE_OPTIONS: { value: ImageStyle; label: string }[] = [
  { value: "photo", label: "Photo" },
  { value: "illustration", label: "Illustration" },
  { value: "3d", label: "3D" },
  { value: "minimal", label: "Minimal" },
  { value: "brand", label: "Brand colors" },
];

/** Presets that fit the selected networks first; always includes square. */
export function presetsFor(networks: Network[]): SizePreset[] {
  if (!networks.length) return SIZE_PRESETS;
  const score = (p: SizePreset) => networks.filter((n) => p.networks.includes(n)).length;
  return [...SIZE_PRESETS].filter((p) => p.id === "square" || score(p) > 0).sort((a, b) => score(b) - score(a));
}

/** Caption → image prompt: drop hashtags, mentions, links and emoji-only lines. */
export function promptFromCaption(caption: string): string {
  return caption
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[#@][\p{L}\p{N}_]+/gu, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /[\p{L}\p{N}]/u.test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function Ratio({ w, h }: { w: number; h: number }) {
  const max = 16;
  const scale = max / Math.max(w, h);
  return <Box w={Math.round(w * scale)} h={Math.round(h * scale)} style={{ border: "1.5px solid currentColor", borderRadius: 3 }} />;
}

interface Props {
  brandId: string;
  opened: boolean;
  onClose: () => void;
  caption?: string;
  networks?: Network[];
  /** Max images that can still be added (the modal caps the count). */
  onAdd: (media: MediaDTO[]) => void;
}

export function AiImageModal({ brandId, opened, onClose, caption = "", networks = [], onAdd }: Props) {
  const presets = useMemo(() => presetsFor(networks), [networks]);
  const [prompt, setPrompt] = useState("");
  const [preset, setPreset] = useState<string>(presets[0]?.id ?? "square");
  const [style, setStyle] = useState<ImageStyle>("illustration");
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<MediaDTO[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!opened) return;
    setPrompt((p) => p || promptFromCaption(caption));
    setPreset((cur) => (presets.some((p) => p.id === cur) ? cur : (presets[0]?.id ?? "square")));
  }, [opened, caption, presets]);

  const size = SIZE_PRESETS.find((p) => p.id === preset) ?? SIZE_PRESETS[0]!;

  async function generate() {
    if (prompt.trim().length < 3) return notifyError(new Error("Describe the image you want"));
    setBusy(true);
    try {
      const res = await api<{ media: MediaDTO[] }>(`/api/brands/${brandId}/ai/image`, "POST", {
        prompt: prompt.trim(),
        width: size.width,
        height: size.height,
        count,
        style,
      });
      setResults((cur) => [...res.media, ...cur]);
      setPicked((cur) => [...res.media.map((m) => m.id), ...cur]);
    } catch (err) {
      notifyError(err, brandId);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setResults([]);
    setPicked([]);
    onClose();
  }

  const chosen = results.filter((m) => picked.includes(m.id));

  return (
    <Modal
      opened={opened}
      onClose={close}
      size="xl"
      title={
        <Group gap={8}>
          <IconSparkles size={18} color="var(--mantine-color-violet-filled)" />
          <Text fw={600}>Generate images with AI</Text>
        </Group>
      }
    >
      <Stack gap="md">
        <Textarea
          label="What should the image show?"
          placeholder="e.g. A sunlit workspace with plants and a laptop, calm and optimistic"
          autosize
          minRows={2}
          maxRows={6}
          maxLength={2000}
          value={prompt}
          onChange={(e) => setPrompt(e.currentTarget.value)}
          disabled={busy}
          data-autofocus
        />
        <Group gap="lg" align="flex-end" wrap="wrap">
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Size
            </Text>
            <SegmentedControl
              value={preset}
              onChange={setPreset}
              disabled={busy}
              data={presets.map((p) => ({
                value: p.id,
                label: (
                  <Tooltip label={`${p.width}×${p.height}`} withArrow>
                    <Group gap={6} wrap="nowrap" justify="center">
                      <Ratio w={p.width} h={p.height} />
                      <span>{p.label}</span>
                    </Group>
                  </Tooltip>
                ),
              }))}
            />
          </Stack>
        </Group>
        <Group gap="lg" align="flex-end" wrap="wrap">
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Style
            </Text>
            <SegmentedControl value={style} onChange={(v) => setStyle(v as ImageStyle)} disabled={busy} data={STYLE_OPTIONS} />
          </Stack>
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Images
            </Text>
            <SegmentedControl value={String(count)} onChange={(v) => setCount(Number(v))} disabled={busy} data={["1", "2", "3", "4"]} />
          </Stack>
        </Group>

        <Group justify="space-between">
          <Badge variant="light" color="violet" size="lg">
            {count * CREDIT_COST.image} credits
          </Badge>
          <Button leftSection={results.length ? <IconRefresh size={16} /> : <IconSparkles size={16} />} loading={busy} onClick={generate} disabled={prompt.trim().length < 3}>
            {results.length ? "Generate more" : "Generate"}
          </Button>
        </Group>

        {(busy || results.length > 0) && (
          <Box style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
            {busy &&
              Array.from({ length: count }).map((_, i) => (
                <Skeleton key={`s${i}`} radius="md" style={{ aspectRatio: `${size.width} / ${size.height}` }} />
              ))}
            {results.map((m) => {
              const on = picked.includes(m.id);
              return (
                <UnstyledButton
                  key={m.id}
                  onClick={() => setPicked((cur) => (on ? cur.filter((x) => x !== m.id) : [...cur, m.id]))}
                  aria-pressed={on}
                  aria-label={on ? "Deselect image" : "Select image"}
                  style={{
                    position: "relative",
                    borderRadius: 10,
                    outline: on ? "3px solid var(--mantine-primary-color-filled)" : "3px solid transparent",
                    outlineOffset: 2,
                    transition: "outline-color 120ms ease",
                  }}
                >
                  <Image src={m.url} alt={m.alt ?? ""} radius="md" style={{ aspectRatio: `${m.width ?? 1} / ${m.height ?? 1}`, objectFit: "cover" }} />
                  {on && (
                    <Box
                      pos="absolute"
                      top={8}
                      right={8}
                      w={22}
                      h={22}
                      style={{ borderRadius: "50%", background: "var(--mantine-primary-color-filled)", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <IconCheck size={14} color="white" />
                    </Box>
                  )}
                </UnstyledButton>
              );
            })}
          </Box>
        )}

        {results.length > 0 && (
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={!chosen.length}
              onClick={() => {
                onAdd(chosen);
                close();
              }}
            >
              Add {chosen.length || ""} to post
            </Button>
          </Group>
        )}
      </Stack>
    </Modal>
  );
}

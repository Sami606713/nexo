"use client";

import { useState } from "react";
import { Badge, Button, Group, Image, Paper, SegmentedControl, Select, SimpleGrid, Skeleton, Stack, Text, Textarea, Tooltip } from "@mantine/core";
import { IconEraser, IconPhotoX, IconSparkles } from "@tabler/icons-react";
import { api } from "@/lib/fetcher";
import { notifyError } from "@/components/ui/notify";
import { aiErrorMessage, canvasSrc } from "../client";
import { useStudio } from "../context";
import { useEditorState, useStore } from "../store";
import { PanelTitle, addImageLayer, setBackgroundImage } from "./common";

type Gen = { id: string; url: string; width: number; height: number; mime: string };

const IDEAS = ["Soft pastel abstract waves", "Sunlit minimalist desk with plants", "Bold geometric shapes, Bauhaus style", "Dreamy gradient sky at dusk"];

export function AiPanel() {
  const { brandId, brand } = useStudio();
  const store = useStore();
  const st = useEditorState();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string>("photo");
  const [count, setCount] = useState("2");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Gen[]>([]);

  const generate = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      // Ask for the canvas aspect ratio at a provider-friendly size.
      const r = st.scene.width / st.scene.height;
      const width = r >= 1 ? 1536 : Math.round((1536 * r) / 64) * 64;
      const height = r >= 1 ? Math.round(1536 / r / 64) * 64 : 1536;
      const out = await api<{ media: Gen[] }>(`/api/brands/${brandId}/ai/image`, "POST", {
        prompt: prompt.trim(),
        width,
        height,
        count: Number(count),
        style,
        ...(style === "brand" && brand.colors.length ? { colors: brand.colors } : {}),
      });
      setResults((prev) => [...out.media, ...prev].slice(0, 12));
    } catch (err) {
      notifyError(new Error(aiErrorMessage(err, "AI image generation")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="sm">
      <PanelTitle title="AI image" hint="Describe a picture — use it as the background or a layer." />
      <Textarea
        placeholder="e.g. A cozy coffee shop at golden hour, shallow depth of field"
        autosize
        minRows={3}
        maxRows={6}
        value={prompt}
        onChange={(e) => setPrompt(e.currentTarget.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void generate();
        }}
      />
      <Group gap={6}>
        {IDEAS.map((i) => (
          <Badge key={i} variant="light" color="gray" style={{ cursor: "pointer", textTransform: "none" }} onClick={() => setPrompt(i)}>
            {i}
          </Badge>
        ))}
      </Group>
      <Group grow>
        <Select
          size="xs"
          label="Style"
          value={style}
          onChange={(v) => v && setStyle(v)}
          allowDeselect={false}
          data={[
            { value: "photo", label: "Photo" },
            { value: "illustration", label: "Illustration" },
            { value: "3d", label: "3D render" },
            { value: "minimal", label: "Minimal" },
            { value: "brand", label: "On-brand colours" },
          ]}
          comboboxProps={{ withinPortal: true }}
        />
        <Stack gap={2}>
          <Text size="xs" fw={500}>
            Images
          </Text>
          <SegmentedControl size="xs" value={count} onChange={setCount} data={["1", "2", "4"]} />
        </Stack>
      </Group>
      <Button leftSection={<IconSparkles size={16} />} loading={busy} disabled={!prompt.trim()} onClick={generate} variant="gradient" gradient={{ from: "indigo", to: "violet" }}>
        Generate
      </Button>
      {busy && (
        <SimpleGrid cols={2} spacing={8}>
          {Array.from({ length: Number(count) }, (_, i) => (
            <Skeleton key={i} h={120} radius="md" />
          ))}
        </SimpleGrid>
      )}
      <SimpleGrid cols={2} spacing={8}>
        {results.map((m) => (
          <Paper key={m.id} withBorder radius="md" p={4}>
            <Image src={canvasSrc(m.url)} alt="" h={110} fit="cover" radius="sm" />
            <Group gap={4} mt={4} grow>
              <Button size="compact-xs" variant="light" onClick={() => addImageLayer(store, m)}>
                Add
              </Button>
              <Button size="compact-xs" variant="default" onClick={() => setBackgroundImage(store, m.url)}>
                Background
              </Button>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt="sm">
        Photo tools
      </Text>
      {[
        { icon: IconPhotoX, label: "Remove background" },
        { icon: IconEraser, label: "Magic erase" },
      ].map((t) => (
        <Tooltip key={t.label} label="Coming soon">
          <Button variant="default" leftSection={<t.icon size={16} />} justify="space-between" rightSection={<Badge size="xs" variant="light">Soon</Badge>} disabled fullWidth>
            {t.label}
          </Button>
        </Tooltip>
      ))}
    </Stack>
  );
}

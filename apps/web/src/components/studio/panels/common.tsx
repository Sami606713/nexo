"use client";

import type { ReactNode } from "react";
import { Stack, Text, Title } from "@mantine/core";
import { canvasSrc, imageSize } from "../client";
import { createImage, type Scene } from "../scene";
import type { EditorStore } from "../store";

export function PanelTitle({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <Stack gap={2} mb="sm">
      <Title order={5}>{title}</Title>
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Stack>
  );
}

export async function addImageLayer(store: EditorStore, media: { id?: string; url: string; width?: number | null; height?: number | null }) {
  const src = canvasSrc(media.url);
  const natural = media.width && media.height ? { width: media.width, height: media.height } : await imageSize(src);
  const scene = store.get().scene;
  store.addLayers([createImage(scene, src, natural, { mediaId: media.id ?? null })]);
}

export function setBackgroundImage(store: EditorStore, url: string) {
  store.commit((s: Scene) => ({ ...s, background: { type: "image", src: canvasSrc(url), overlay: null } }));
}

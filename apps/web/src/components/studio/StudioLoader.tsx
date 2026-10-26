"use client";

import dynamic from "next/dynamic";
import { Loader, Stack, Text } from "@mantine/core";
import type { BrandAssets } from "./context";
import type { EditorDesign } from "./StudioEditor";

const StudioEditor = dynamic(() => import("./StudioEditor"), {
  ssr: false,
  loading: () => (
    <div style={{ position: "fixed", inset: 0, zIndex: 150, display: "grid", placeItems: "center", background: "var(--mantine-color-body)" }}>
      <Stack align="center" gap="xs">
        <Loader />
        <Text size="sm" c="dimmed">
          Opening Studio…
        </Text>
      </Stack>
    </div>
  ),
});

export function StudioLoader(props: { brandId: string; design: EditorDesign; brand: BrandAssets }) {
  return <StudioEditor {...props} />;
}

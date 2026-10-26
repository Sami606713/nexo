"use client";

import Link from "next/link";
import { Button, Group, Image, SimpleGrid, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconPalette } from "@tabler/icons-react";
import { Swatch } from "../ColorControl";
import { useStudio } from "../context";
import type { Layer } from "../scene";
import { useStore } from "../store";
import { PanelTitle, addImageLayer } from "./common";

/** Apply a colour to whatever is selected (or the page background when nothing is). */
export function applyColor(store: ReturnType<typeof useStore>, color: string) {
  const sel = store.selectedLayers();
  if (!sel.length) {
    store.commit((s) => ({ ...s, background: { type: "color", color } }));
    return;
  }
  store.updateSelected((l: Layer): Partial<Layer> => {
    switch (l.type) {
      case "text":
        return { fill: color } as Partial<Layer>;
      case "rect":
      case "ellipse":
      case "star":
        return { fill: color, gradient: null } as Partial<Layer>;
      case "line":
        return { stroke: color } as Partial<Layer>;
      case "icon":
        return { color } as Partial<Layer>;
      default:
        return {};
    }
  });
}

export function BrandPanel() {
  const { brand, brandId } = useStudio();
  const store = useStore();
  const empty = !brand.colors.length && !brand.logos.length;
  return (
    <Stack gap="sm">
      <PanelTitle title="Brand" hint="One click applies to the selection — or the background when nothing is selected." />
      {empty && (
        <Stack align="center" gap="xs" py="lg">
          <IconPalette size={32} style={{ color: "var(--mantine-color-dimmed)" }} />
          <Text size="sm" c="dimmed" ta="center">
            Add your brand colours and logos to keep every design on-brand.
          </Text>
          <Button component={Link} href={`/app/${brandId}/brand`} size="xs" variant="light">
            Set up brand kit
          </Button>
        </Stack>
      )}
      {brand.colors.length > 0 && (
        <>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
            Colors
          </Text>
          <Group gap={8}>
            {brand.colors.map((c) => (
              <Swatch key={c} color={c} size={38} onClick={() => applyColor(store, c)} />
            ))}
          </Group>
        </>
      )}
      {brand.logos.length > 0 && (
        <>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt="xs">
            Logos
          </Text>
          <SimpleGrid cols={2} spacing={8}>
            {brand.logos.map((l, i) => (
              <UnstyledButton
                key={`${l.url}-${i}`}
                className="studio-tile"
                onClick={() => addImageLayer(store, { url: l.url })}
                p="sm"
                style={{ borderRadius: 10, border: "1px solid var(--mantine-color-default-border)", background: "repeating-conic-gradient(rgba(127,127,127,.12) 0% 25%, transparent 0% 50%) 50% / 16px 16px" }}
                aria-label="Add logo"
              >
                <Image src={l.url} alt={l.kind ?? "Logo"} h={70} fit="contain" />
              </UnstyledButton>
            ))}
          </SimpleGrid>
        </>
      )}
    </Stack>
  );
}

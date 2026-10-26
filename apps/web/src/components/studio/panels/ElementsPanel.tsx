"use client";

import { useMemo, useState } from "react";
import { SimpleGrid, Stack, Text, TextInput, Tooltip, UnstyledButton } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useStudio } from "../context";
import { ICON_NAMES, iconSvg } from "../icons";
import { createIcon, createShape, type ShapeKind } from "../scene";
import { useStore } from "../store";
import { PanelTitle } from "./common";

const SHAPES: { kind: ShapeKind; label: string; svg: string }[] = [
  { kind: "rect", label: "Square", svg: '<rect x="4" y="4" width="32" height="32"/>' },
  { kind: "rounded", label: "Rounded square", svg: '<rect x="4" y="4" width="32" height="32" rx="8"/>' },
  { kind: "ellipse", label: "Circle", svg: '<circle cx="20" cy="20" r="16"/>' },
  { kind: "star", label: "Star", svg: '<polygon points="20,3 25,15 38,15 27.5,23 31.5,36 20,28 8.5,36 12.5,23 2,15 15,15"/>' },
  { kind: "burst", label: "Burst", svg: '<polygon points="20,2 23,9 30,5 29,13 37,13 32,19 38,24 30,26 32,34 24,31 20,38 16,31 8,34 10,26 2,24 8,19 3,13 11,13 10,5 17,9"/>' },
  { kind: "line", label: "Line", svg: '<rect x="3" y="18" width="34" height="4" rx="2"/>' },
  { kind: "dashed", label: "Dashed line", svg: '<rect x="3" y="18" width="8" height="4" rx="2"/><rect x="16" y="18" width="8" height="4" rx="2"/><rect x="29" y="18" width="8" height="4" rx="2"/>' },
];

export function ElementsPanel() {
  const store = useStore();
  const { brand } = useStudio();
  const [q, setQ] = useState("");
  const accent = brand.colors[0] ?? "#6366f1";
  const icons = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ICON_NAMES.filter((n) => !s || n.includes(s));
  }, [q]);

  return (
    <Stack gap="sm">
      <PanelTitle title="Elements" hint="Shapes, lines and icons — recolour them from the toolbar." />
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        Shapes
      </Text>
      <SimpleGrid cols={4} spacing={8}>
        {SHAPES.map((s) => (
          <Tooltip key={s.kind} label={s.label} openDelay={300}>
            <UnstyledButton
              className="studio-tile"
              onClick={() => store.addLayers([createShape(store.get().scene, s.kind, accent)])}
              style={{ aspectRatio: "1", borderRadius: 10, display: "grid", placeItems: "center", background: "var(--mantine-color-default-hover)" }}
              aria-label={`Add ${s.label}`}
            >
              <svg width="38" height="38" viewBox="0 0 40 40" fill={accent} dangerouslySetInnerHTML={{ __html: s.svg }} />
            </UnstyledButton>
          </Tooltip>
        ))}
      </SimpleGrid>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt="xs">
        Icons
      </Text>
      <TextInput size="sm" placeholder="Search icons" leftSection={<IconSearch size={15} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
      <SimpleGrid cols={5} spacing={6}>
        {icons.map((n) => (
          <Tooltip key={n} label={n.replace(/-/g, " ")} openDelay={400}>
            <UnstyledButton
              className="studio-tile"
              onClick={() => store.addLayers([createIcon(store.get().scene, n, "#111827")])}
              style={{ aspectRatio: "1", borderRadius: 8, display: "grid", placeItems: "center", background: "var(--mantine-color-default-hover)", color: "var(--mantine-color-text)" }}
              aria-label={`Add ${n} icon`}
            >
              <span style={{ width: 24, height: 24, display: "block" }} dangerouslySetInnerHTML={{ __html: iconSvg(n, "currentColor", 1.75, 24) }} />
            </UnstyledButton>
          </Tooltip>
        ))}
      </SimpleGrid>
      {icons.length === 0 && (
        <Text size="sm" c="dimmed" ta="center">
          No icons match “{q}”.
        </Text>
      )}
    </Stack>
  );
}

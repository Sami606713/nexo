"use client";

import { Button, Divider, Stack, Text, UnstyledButton } from "@mantine/core";
import { ensureFont } from "../client";
import { FONT_COMBOS } from "../fonts";
import { createText, type TextPreset } from "../scene";
import { useStore } from "../store";
import { PanelTitle } from "./common";

const PRESETS: { preset: TextPreset; label: string; size: number; weight: number }[] = [
  { preset: "heading", label: "Add a heading", size: 26, weight: 800 },
  { preset: "subheading", label: "Add a subheading", size: 18, weight: 600 },
  { preset: "body", label: "Add a little bit of body text", size: 14, weight: 400 },
  { preset: "caption", label: "ADD A CAPTION", size: 12, weight: 600 },
];

export function TextPanel() {
  const store = useStore();
  const add = (preset: TextPreset) => {
    const scene = store.get().scene;
    store.addLayers([createText(scene, preset)]);
  };
  const addCombo = async (c: (typeof FONT_COMBOS)[number]) => {
    await Promise.all([ensureFont(c.heading.family, c.heading.weight), ensureFont(c.body.family, c.body.weight)]);
    const scene = store.get().scene;
    const head = createText(scene, "heading", { text: c.sample[0], fontFamily: c.heading.family, fontWeight: c.heading.weight });
    const body = createText(scene, "body", { text: c.sample[1], fontFamily: c.body.family, fontWeight: c.body.weight, fill: "#4b5563" });
    const gap = Math.round(scene.height * 0.02);
    const total = head.height + gap + body.height;
    head.y = Math.round((scene.height - total) / 2);
    body.y = head.y + head.height + gap;
    store.addLayers([head, body]);
  };
  return (
    <Stack gap="sm">
      <PanelTitle title="Text" hint="Click to add. Double-click on the canvas to edit." />
      {PRESETS.map((p) => (
        <Button
          key={p.preset}
          variant="default"
          h="auto"
          py={10}
          justify="flex-start"
          onClick={() => add(p.preset)}
          styles={{ label: { fontSize: p.size, fontWeight: p.weight, whiteSpace: "normal", textAlign: "left", letterSpacing: p.preset === "caption" ? 2 : 0 } }}
        >
          {p.label}
        </Button>
      ))}
      <Divider label="Font combinations" labelPosition="left" mt="xs" />
      <Stack gap={8}>
        {FONT_COMBOS.map((c) => (
          <UnstyledButton
            key={c.name}
            onClick={() => addCombo(c)}
            p="sm"
            className="studio-tile"
            style={{ borderRadius: 10, border: "1px solid var(--mantine-color-default-border)" }}
          >
            <Text style={{ fontFamily: `"${c.heading.family}"`, fontWeight: c.heading.weight, fontSize: 22, lineHeight: 1.1 }}>{c.sample[0]}</Text>
            <Text size="sm" c="dimmed" style={{ fontFamily: `"${c.body.family}"`, fontWeight: c.body.weight }}>
              {c.sample[1]}
            </Text>
            <Text size="10px" c="dimmed" mt={6} tt="uppercase" fw={700} style={{ letterSpacing: 1 }}>
              {c.name} · {c.heading.family} + {c.body.family}
            </Text>
          </UnstyledButton>
        ))}
      </Stack>
    </Stack>
  );
}

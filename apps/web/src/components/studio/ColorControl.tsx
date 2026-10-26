"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ColorPicker, Divider, Group, Popover, SimpleGrid, Stack, Text, TextInput, Tooltip, UnstyledButton } from "@mantine/core";
import { cssGradient, linear, sceneColors, type Gradient } from "./colorkit";
import { useStudio } from "./context";
import { useEditorState } from "./store";

export const DEFAULT_SWATCHES = [
  "#000000", "#ffffff", "#111827", "#6b7280", "#e5e7eb", "#ef4444", "#f97316", "#f59e0b", "#facc15", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#ec4899",
];

export const GRADIENT_PRESETS: Gradient[] = [
  linear(135, "#6366f1", "#a855f7"),
  linear(135, "#ec4899", "#f97316"),
  linear(135, "#06b6d4", "#3b82f6"),
  linear(135, "#22c55e", "#14b8a6"),
  linear(135, "#f59e0b", "#ef4444"),
  linear(90, "#0f172a", "#334155"),
  linear(135, "#fde68a", "#fca5a5"),
  linear(135, "#a7f3d0", "#bfdbfe"),
  { kind: "radial", angle: 0, stops: [{ offset: 0, color: "#818cf8" }, { offset: 1, color: "#1e1b4b" }] },
  { kind: "radial", angle: 0, stops: [{ offset: 0, color: "#fef3c7" }, { offset: 1, color: "#f59e0b" }] },
];

export function Swatch({ color, gradient, active, onClick, label, size = 26 }: { color?: string; gradient?: Gradient; active?: boolean; onClick: () => void; label?: string; size?: number }) {
  return (
    <Tooltip label={label ?? color ?? "Gradient"} openDelay={400}>
      <UnstyledButton
        onClick={onClick}
        aria-label={label ?? color ?? "Gradient"}
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          background: gradient ? cssGradient(gradient) : color,
          boxShadow: active ? "0 0 0 2px var(--mantine-color-body), 0 0 0 4px var(--mantine-color-indigo-5)" : "inset 0 0 0 1px rgba(127,127,127,0.35)",
          transition: "transform 120ms ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "")}
      />
    </Tooltip>
  );
}

function SwatchRow({ title, colors, value, onPick }: { title: string; colors: string[]; value: string; onPick: (c: string) => void }) {
  if (!colors.length) return null;
  return (
    <Stack gap={6}>
      <Text size="xs" fw={600} c="dimmed">
        {title}
      </Text>
      <SimpleGrid cols={8} spacing={6} verticalSpacing={6}>
        {colors.map((c) => (
          <Swatch key={c} color={c} active={c.toLowerCase() === value.toLowerCase()} onClick={() => onPick(c)} />
        ))}
      </SimpleGrid>
    </Stack>
  );
}

/**
 * Colour button + popover. `onChange(color, final)`: final=false while dragging the picker (coalesced into one undo step).
 * When `onGradient` is given, a gradient row is offered too.
 */
export function ColorControl({
  value,
  gradient,
  onChange,
  onGradient,
  label = "Color",
  target,
}: {
  value: string;
  gradient?: Gradient | null;
  onChange: (color: string) => void;
  onGradient?: (g: Gradient) => void;
  label?: string;
  target?: ReactNode;
}) {
  const { brand } = useStudio();
  const st = useEditorState();
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  const docColors = sceneColors(st.scene).slice(0, 16);

  return (
    <Popover position="bottom-start" shadow="lg" width={272} withinPortal trapFocus={false}>
      <Popover.Target>
        {target ?? (
          <Tooltip label={label}>
            <UnstyledButton
              aria-label={label}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: gradient ? cssGradient(gradient) : value,
                boxShadow: "inset 0 0 0 1px rgba(127,127,127,0.4)",
              }}
            />
          </Tooltip>
        )}
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <ColorPicker
            fullWidth
            format="hex"
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
            onChange={(c) => {
              setHex(c);
              onChange(c);
            }}
          />
          <TextInput
            size="xs"
            value={hex}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setHex(v);
              if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v);
            }}
            leftSection={<div style={{ width: 14, height: 14, borderRadius: 4, background: value }} />}
          />
          <SwatchRow title="Brand colors" colors={brand.colors} value={value} onPick={onChange} />
          <SwatchRow title="In this design" colors={docColors} value={value} onPick={onChange} />
          <SwatchRow title="Default" colors={DEFAULT_SWATCHES} value={value} onPick={onChange} />
          {onGradient && (
            <>
              <Divider />
              <Text size="xs" fw={600} c="dimmed">
                Gradients
              </Text>
              <Group gap={6}>
                {(brand.colors.length >= 2 ? [linear(135, brand.colors[0]!, brand.colors[1]!), ...GRADIENT_PRESETS] : GRADIENT_PRESETS).map((g, i) => (
                  <Swatch key={i} gradient={g} onClick={() => onGradient(g)} label="Gradient" />
                ))}
              </Group>
            </>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

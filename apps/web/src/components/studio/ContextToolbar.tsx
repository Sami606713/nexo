"use client";

import { useState, type ReactNode } from "react";
import {
  ActionIcon,
  Button,
  ColorSwatch,
  Divider,
  Group,
  Loader,
  Menu,
  NumberInput,
  Popover,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconAdjustmentsHorizontal,
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconArrowAutofitWidth,
  IconBold,
  IconBorderRadius,
  IconCopy,
  IconFlipHorizontal,
  IconFlipVertical,
  IconItalic,
  IconLayersSubtract,
  IconLayoutAlignBottom,
  IconLayoutAlignCenter,
  IconLayoutAlignLeft,
  IconLayoutAlignMiddle,
  IconLayoutAlignRight,
  IconLayoutAlignTop,
  IconLetterCase,
  IconLineHeight,
  IconLock,
  IconLockOpen,
  IconPhoto,
  IconSparkles,
  IconTrash,
  IconDroplet,
  IconUnderline,
  IconWand,
} from "@tabler/icons-react";
import { api } from "@/lib/fetcher";
import { notifyError } from "@/components/ui/notify";
import { ColorControl } from "./ColorControl";
import { aiErrorMessage, ensureFont } from "./client";
import { useStudio } from "./context";
import { FONTS, nearestWeight } from "./fonts";
import { layerBounds, type Background, type ImageLayer, type Layer, type LineLayer, type ShapeProps, type StarLayer, type TextLayer } from "./scene";
import { useEditorState, useStore } from "./store";

const Sep = () => <Divider orientation="vertical" mx={2} />;

function Tool({ label, active, onClick, children, disabled }: { label: string; active?: boolean; onClick?: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <Tooltip label={label} openDelay={300}>
      <ActionIcon variant={active ? "light" : "subtle"} color={active ? "indigo" : "gray"} size={32} onClick={onClick} aria-label={label} disabled={disabled}>
        {children}
      </ActionIcon>
    </Tooltip>
  );
}

function SliderRow({ label, value, min, max, step = 1, onChange, suffix = "" }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <Stack gap={4}>
      <Group justify="space-between">
        <Text size="xs" fw={600}>
          {label}
        </Text>
        <Text size="xs" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>
          {Math.round(value * 100) / 100}
          {suffix}
        </Text>
      </Group>
      <Slider size="sm" value={value} min={min} max={max} step={step} onChange={onChange} label={null} />
    </Stack>
  );
}

function PopTool({ label, icon, children, width = 240 }: { label: string; icon: ReactNode; children: ReactNode; width?: number }) {
  return (
    <Popover position="bottom" shadow="lg" width={width} withinPortal>
      <Popover.Target>
        <Tooltip label={label} openDelay={300}>
          <ActionIcon variant="subtle" color="gray" size={32} aria-label={label}>
            {icon}
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">{children}</Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

const LANGS = ["Spanish", "French", "German", "Portuguese", "Italian", "Dutch", "Japanese", "Arabic", "Urdu"];

function AiTextMenu({ layer }: { layer: TextLayer }) {
  const { brandId } = useStudio();
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const run = async (action: string, targetLanguage?: string) => {
    setBusy(true);
    try {
      const out = await api<{ text: string }>(`/api/brands/${brandId}/ai/rewrite`, "POST", { text: layer.text, action, targetLanguage });
      const text = out.text.trim().replace(/^["“]|["”]$/g, "");
      store.updateLayers([layer.id], { text } as Partial<TextLayer>);
    } catch (err) {
      notifyError(new Error(aiErrorMessage(err, "AI writing")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Menu shadow="lg" position="bottom-start" withinPortal width={210}>
      <Menu.Target>
        <Button
          size="compact-sm"
          variant="light"
          color="violet"
          leftSection={busy ? <Loader size={12} color="violet" /> : <IconSparkles size={14} />}
          disabled={busy}
        >
          AI
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Rewrite this text · 1 credit</Menu.Label>
        <Menu.Item leftSection={<IconWand size={15} />} onClick={() => run("rewrite")}>
          Rewrite
        </Menu.Item>
        <Menu.Item onClick={() => run("shorten")}>Make shorter</Menu.Item>
        <Menu.Item onClick={() => run("expand")}>Make longer</Menu.Item>
        <Menu.Item onClick={() => run("fix_grammar")}>Fix spelling & grammar</Menu.Item>
        <Menu.Sub position="right-start">
          <Menu.Sub.Target>
            <Menu.Sub.Item>Translate</Menu.Sub.Item>
          </Menu.Sub.Target>
          <Menu.Sub.Dropdown>
            {LANGS.map((l) => (
              <Menu.Item key={l} onClick={() => run("translate", l)}>
                {l}
              </Menu.Item>
            ))}
          </Menu.Sub.Dropdown>
        </Menu.Sub>
      </Menu.Dropdown>
    </Menu>
  );
}

const fontOptions = FONTS.map((f) => ({ value: f.family, label: f.family }));

function TextTools({ l }: { l: TextLayer }) {
  const store = useStore();
  const set = (p: Partial<TextLayer>, key?: string) => store.updateSelected(p as Partial<Layer>, key);
  const bold = l.fontWeight >= 600;
  const AlignIcon = l.align === "left" ? IconAlignLeft : l.align === "right" ? IconAlignRight : IconAlignCenter;
  return (
    <>
      <Select
        size="xs"
        w={170}
        data={fontOptions}
        value={l.fontFamily}
        searchable
        allowDeselect={false}
        comboboxProps={{ withinPortal: true, width: 220 }}
        maxDropdownHeight={360}
        renderOption={({ option }) => <span style={{ fontFamily: `"${option.value}"`, fontSize: 16 }}>{option.label}</span>}
        styles={{ input: { fontFamily: `"${l.fontFamily}"` } }}
        onChange={async (v) => {
          if (!v) return;
          await ensureFont(v, l.fontWeight, l.italic);
          set({ fontFamily: v, fontWeight: nearestWeight(v, l.fontWeight) });
        }}
        aria-label="Font"
      />
      <NumberInput
        size="xs"
        w={74}
        min={4}
        max={1000}
        value={Math.round(l.fontSize)}
        onChange={(v) => typeof v === "number" && v >= 4 && set({ fontSize: v }, "fontSize")}
        aria-label="Font size"
      />
      <ColorControl value={l.fill} onChange={(c) => set({ fill: c }, "fill")} label="Text color" />
      <Sep />
      <Tool
        label="Bold"
        active={bold}
        onClick={async () => {
          const w = nearestWeight(l.fontFamily, bold ? 400 : 700);
          await ensureFont(l.fontFamily, w, l.italic);
          set({ fontWeight: w });
        }}
      >
        <IconBold size={17} />
      </Tool>
      <Tool label="Italic" active={!!l.italic} onClick={() => set({ italic: !l.italic })}>
        <IconItalic size={17} />
      </Tool>
      <Tool label="Underline" active={!!l.underline} onClick={() => set({ underline: !l.underline })}>
        <IconUnderline size={17} />
      </Tool>
      <Tool label="Uppercase" active={!!l.uppercase} onClick={() => set({ uppercase: !l.uppercase })}>
        <IconLetterCase size={17} />
      </Tool>
      <Tool label={`Align ${l.align}`} onClick={() => set({ align: l.align === "left" ? "center" : l.align === "center" ? "right" : "left" })}>
        <AlignIcon size={17} />
      </Tool>
      <PopTool label="Spacing" icon={<IconLineHeight size={17} />}>
        <SliderRow label="Letter spacing" value={l.letterSpacing} min={-10} max={40} step={0.5} onChange={(v) => set({ letterSpacing: v }, "ls")} />
        <SliderRow label="Line height" value={l.lineHeight} min={0.7} max={2.5} step={0.05} onChange={(v) => set({ lineHeight: v }, "lh")} />
        <Text size="xs" fw={600}>
          Weight
        </Text>
        <Group gap={4}>
          {(FONTS.find((f) => f.family === l.fontFamily)?.weights ?? [400, 700]).map((w) => (
            <Button key={w} size="compact-xs" variant={w === l.fontWeight ? "filled" : "default"} onClick={async () => {
              await ensureFont(l.fontFamily, w, l.italic);
              set({ fontWeight: w });
            }}>
              {w}
            </Button>
          ))}
        </Group>
      </PopTool>
      <PopTool label="Effects" icon={<IconAdjustmentsHorizontal size={17} />} width={260}>
        <Switch
          label="Shadow"
          checked={!!l.shadow}
          onChange={(e) => set({ shadow: e.currentTarget.checked ? { color: "#000000", blur: l.fontSize * 0.3, offsetX: 0, offsetY: l.fontSize * 0.08, opacity: 0.35 } : null })}
        />
        {l.shadow && (
          <>
            <SliderRow label="Blur" value={l.shadow.blur} min={0} max={100} onChange={(v) => set({ shadow: { ...l.shadow!, blur: v } }, "sh-blur")} />
            <SliderRow label="Offset" value={l.shadow.offsetY} min={-60} max={60} onChange={(v) => set({ shadow: { ...l.shadow!, offsetY: v } }, "sh-off")} />
            <SliderRow label="Strength" value={l.shadow.opacity} min={0} max={1} step={0.05} onChange={(v) => set({ shadow: { ...l.shadow!, opacity: v } }, "sh-op")} />
            <Group gap="xs">
              <Text size="xs" fw={600}>
                Shadow color
              </Text>
              <ColorControl value={l.shadow.color} onChange={(c) => set({ shadow: { ...l.shadow!, color: c } }, "sh-col")} />
            </Group>
          </>
        )}
        <Divider />
        <Switch
          label="Background pill"
          checked={!!l.pill}
          onChange={(e) =>
            set({ pill: e.currentTarget.checked ? { color: "#6366f1", paddingX: l.fontSize * 0.7, paddingY: l.fontSize * 0.4, radius: 999 } : null })
          }
        />
        {l.pill && (
          <>
            <Group gap="xs">
              <Text size="xs" fw={600}>
                Pill color
              </Text>
              <ColorControl value={l.pill.color} onChange={(c) => set({ pill: { ...l.pill!, color: c } }, "pill-col")} />
            </Group>
            <SliderRow label="Padding" value={l.pill.paddingX} min={0} max={120} onChange={(v) => set({ pill: { ...l.pill!, paddingX: v, paddingY: v * 0.6 } }, "pill-pad")} />
            <SliderRow label="Roundness" value={Math.min(l.pill.radius, 200)} min={0} max={200} onChange={(v) => set({ pill: { ...l.pill!, radius: v } }, "pill-r")} />
          </>
        )}
      </PopTool>
      <Sep />
      <AiTextMenu layer={l} />
    </>
  );
}

function ShapeTools({ l }: { l: Layer & ShapeProps }) {
  const store = useStore();
  const set = (p: Partial<Layer & ShapeProps>, key?: string) => store.updateSelected(p as Partial<Layer>, key);
  return (
    <>
      <ColorControl value={l.fill} gradient={l.gradient} onChange={(c) => set({ fill: c, gradient: null }, "fill")} onGradient={(g) => set({ gradient: g })} label="Fill" />
      <PopTool label="Border" icon={<ColorSwatch color={l.strokeWidth ? l.stroke : "transparent"} size={18} withShadow style={{ border: "2px solid currentColor" }} />}>
        <SliderRow label="Border width" value={l.strokeWidth} min={0} max={60} onChange={(v) => set({ strokeWidth: v }, "sw")} />
        <Group gap="xs">
          <Text size="xs" fw={600}>
            Border color
          </Text>
          <ColorControl value={l.stroke} onChange={(c) => set({ stroke: c, strokeWidth: l.strokeWidth || 4 }, "stroke")} />
        </Group>
      </PopTool>
      {l.type === "rect" && (
        <PopTool label="Corner radius" icon={<IconBorderRadius size={17} />}>
          <SliderRow label="Corner radius" value={(l as Extract<Layer, { type: "rect" }>).cornerRadius} min={0} max={Math.round(Math.min(l.width, l.height) / 2)} onChange={(v) => set({ cornerRadius: v } as never, "cr")} />
        </PopTool>
      )}
      {l.type === "star" && (
        <PopTool label="Points" icon={<IconSparkles size={17} />}>
          <SliderRow label="Points" value={(l as StarLayer).numPoints} min={3} max={30} onChange={(v) => set({ numPoints: v } as never, "pts")} />
          <SliderRow label="Inner radius" value={(l as StarLayer).innerRatio} min={0.1} max={0.95} step={0.01} onChange={(v) => set({ innerRatio: v } as never, "inr")} />
        </PopTool>
      )}
    </>
  );
}

function ImageTools({ l }: { l: ImageLayer }) {
  const store = useStore();
  const set = (p: Partial<ImageLayer>, key?: string) => store.updateSelected(p as Partial<Layer>, key);
  const f = l.filters;
  return (
    <>
      <PopTool label="Adjust" icon={<IconAdjustmentsHorizontal size={17} />} width={260}>
        <SliderRow label="Brightness" value={f.brightness} min={-0.6} max={0.6} step={0.02} onChange={(v) => set({ filters: { ...f, brightness: v } }, "f-b")} />
        <SliderRow label="Contrast" value={f.contrast} min={-60} max={60} onChange={(v) => set({ filters: { ...f, contrast: v } }, "f-c")} />
        <SliderRow label="Blur" value={f.blur} min={0} max={40} onChange={(v) => set({ filters: { ...f, blur: v } }, "f-bl")} />
        <Switch label="Black & white" checked={f.grayscale} onChange={(e) => set({ filters: { ...f, grayscale: e.currentTarget.checked } })} />
        <Button size="xs" variant="default" onClick={() => set({ filters: { brightness: 0, contrast: 0, grayscale: false, blur: 0 } })}>
          Reset
        </Button>
      </PopTool>
      <PopTool label="Corner radius" icon={<IconBorderRadius size={17} />}>
        <SliderRow label="Corner radius" value={l.cornerRadius} min={0} max={Math.round(Math.min(l.width, l.height) / 2)} onChange={(v) => set({ cornerRadius: v }, "cr")} />
      </PopTool>
      <Tooltip label="Use as page background">
        <Button
          size="compact-sm"
          variant="default"
          leftSection={<IconPhoto size={14} />}
          onClick={() =>
            store.commit((s) => ({ ...s, background: { type: "image", src: l.src, overlay: null }, layers: s.layers.filter((x) => x.id !== l.id) }))
          }
        >
          Set as background
        </Button>
      </Tooltip>
    </>
  );
}

function LineTools({ l }: { l: LineLayer }) {
  const store = useStore();
  const set = (p: Partial<LineLayer>, key?: string) => store.updateSelected(p as Partial<Layer>, key);
  return (
    <>
      <ColorControl value={l.stroke} onChange={(c) => set({ stroke: c }, "stroke")} label="Line color" />
      <NumberInput size="xs" w={74} min={1} max={200} value={Math.round(l.strokeWidth)} onChange={(v) => typeof v === "number" && set({ strokeWidth: v, height: Math.max(v, 4) }, "sw")} aria-label="Line weight" />
      <Tool label="Dashed" active={l.dash} onClick={() => set({ dash: !l.dash })}>
        <IconArrowAutofitWidth size={17} />
      </Tool>
    </>
  );
}

function BackgroundTools() {
  const store = useStore();
  const st = useEditorState();
  const bg = st.scene.background;
  const setBg = (b: Background, key?: string) => store.commit((s) => ({ ...s, background: b }), { key });
  const color = bg.type === "color" ? bg.color : bg.type === "image" ? (bg.color ?? "#ffffff") : (bg.gradient.stops[0]?.color ?? "#ffffff");
  return (
    <>
      <Text size="sm" fw={600} c="dimmed" mr={4}>
        Background
      </Text>
      <ColorControl
        value={color}
        gradient={bg.type === "gradient" ? bg.gradient : null}
        onChange={(c) => setBg({ type: "color", color: c }, "bg")}
        onGradient={(g) => setBg({ type: "gradient", gradient: g })}
        label="Background"
      />
      {bg.type === "image" && (
        <>
          <PopTool label="Overlay" icon={<IconDroplet size={17} />}>
            <SliderRow
              label="Darken"
              value={bg.overlay?.opacity ?? 0}
              min={0}
              max={0.9}
              step={0.05}
              onChange={(v) => setBg({ ...bg, overlay: { color: bg.overlay?.color ?? "#000000", opacity: v } }, "ov")}
            />
            <Group gap="xs">
              <Text size="xs" fw={600}>
                Overlay color
              </Text>
              <ColorControl value={bg.overlay?.color ?? "#000000"} onChange={(c) => setBg({ ...bg, overlay: { color: c, opacity: bg.overlay?.opacity || 0.4 } }, "ovc")} />
            </Group>
          </PopTool>
          <Button size="compact-sm" variant="subtle" color="gray" onClick={() => setBg({ type: "color", color: "#ffffff" })}>
            Remove image
          </Button>
        </>
      )}
      <Text size="xs" c="dimmed" ml="sm" visibleFrom="lg">
        Tip: double-click text to edit · drag on empty space to multi-select
      </Text>
    </>
  );
}

function AlignMenu() {
  const store = useStore();
  const st = useEditorState();
  const sel = store.selectedLayers().filter((l) => !l.locked);
  const align = (mode: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") => {
    const W = st.scene.width;
    const H = st.scene.height;
    const boxes = sel.map((l) => ({ l, b: layerBounds(l) }));
    const ref =
      sel.length > 1
        ? {
            x: Math.min(...boxes.map((x) => x.b.x)),
            y: Math.min(...boxes.map((x) => x.b.y)),
            right: Math.max(...boxes.map((x) => x.b.right)),
            bottom: Math.max(...boxes.map((x) => x.b.bottom)),
          }
        : { x: 0, y: 0, right: W, bottom: H };
    const map = new Map<string, Partial<Layer>>();
    for (const { l, b } of boxes) {
      const bw = b.right - b.x;
      const bh = b.bottom - b.y;
      let dx = 0;
      let dy = 0;
      if (mode === "left") dx = ref.x - b.x;
      if (mode === "right") dx = ref.right - bw - b.x;
      if (mode === "hcenter") dx = (ref.x + ref.right) / 2 - bw / 2 - b.x;
      if (mode === "top") dy = ref.y - b.y;
      if (mode === "bottom") dy = ref.bottom - bh - b.y;
      if (mode === "vcenter") dy = (ref.y + ref.bottom) / 2 - bh / 2 - b.y;
      map.set(l.id, { x: l.x + dx, y: l.y + dy });
    }
    store.updateLayers([...map.keys()], (l) => map.get(l.id) ?? {});
  };
  return (
    <Menu shadow="lg" withinPortal position="bottom-end">
      <Menu.Target>
        <Button size="compact-sm" variant="subtle" color="gray">
          Position
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Align to {sel.length > 1 ? "selection" : "page"}</Menu.Label>
        <Menu.Item leftSection={<IconLayoutAlignLeft size={15} />} onClick={() => align("left")}>Left</Menu.Item>
        <Menu.Item leftSection={<IconLayoutAlignCenter size={15} />} onClick={() => align("hcenter")}>Center</Menu.Item>
        <Menu.Item leftSection={<IconLayoutAlignRight size={15} />} onClick={() => align("right")}>Right</Menu.Item>
        <Menu.Item leftSection={<IconLayoutAlignTop size={15} />} onClick={() => align("top")}>Top</Menu.Item>
        <Menu.Item leftSection={<IconLayoutAlignMiddle size={15} />} onClick={() => align("vcenter")}>Middle</Menu.Item>
        <Menu.Item leftSection={<IconLayoutAlignBottom size={15} />} onClick={() => align("bottom")}>Bottom</Menu.Item>
        <Menu.Divider />
        <Menu.Label>Layer order</Menu.Label>
        <Menu.Item onClick={() => store.arrange("front")} rightSection={<Text size="xs" c="dimmed">Ctrl ⇧ ]</Text>}>Bring to front</Menu.Item>
        <Menu.Item onClick={() => store.arrange("forward")} rightSection={<Text size="xs" c="dimmed">Ctrl ]</Text>}>Bring forward</Menu.Item>
        <Menu.Item onClick={() => store.arrange("backward")} rightSection={<Text size="xs" c="dimmed">Ctrl [</Text>}>Send backward</Menu.Item>
        <Menu.Item onClick={() => store.arrange("back")} rightSection={<Text size="xs" c="dimmed">Ctrl ⇧ [</Text>}>Send to back</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export function ContextToolbar() {
  const store = useStore();
  useEditorState();
  const sel = store.selectedLayers();
  const single = sel.length === 1 ? sel[0]! : null;
  const allLocked = sel.length > 0 && sel.every((l) => l.locked);
  const opacity = sel.length ? sel[0]!.opacity : 1;

  return (
    <Group
      gap={6}
      px="md"
      h={52}
      wrap="nowrap"
      style={{ borderBottom: "1px solid var(--mantine-color-default-border)", background: "var(--mantine-color-body)", overflowX: "auto", flexShrink: 0 }}
    >
      {!sel.length && <BackgroundTools />}
      {single && !single.locked && (
        <>
          {single.type === "text" && <TextTools l={single} />}
          {(single.type === "rect" || single.type === "ellipse" || single.type === "star") && <ShapeTools l={single} />}
          {single.type === "image" && <ImageTools l={single} />}
          {single.type === "line" && <LineTools l={single} />}
          {single.type === "icon" && (
            <>
              <ColorControl value={single.color} onChange={(c) => store.updateSelected({ color: c } as Partial<Layer>, "color")} label="Icon color" />
              <PopTool label="Stroke" icon={<IconLineHeight size={17} />}>
                <SliderRow label="Stroke" value={single.strokeWidth} min={0.5} max={3} step={0.05} onChange={(v) => store.updateSelected({ strokeWidth: v } as Partial<Layer>, "isw")} />
              </PopTool>
            </>
          )}
        </>
      )}
      {sel.length > 1 && (
        <Text size="sm" c="dimmed" fw={600}>
          {sel.length} layers selected
        </Text>
      )}
      {single?.locked && (
        <Text size="sm" c="dimmed">
          This layer is locked
        </Text>
      )}
      {sel.length > 0 && (
        <>
          <div style={{ flex: 1 }} />
          {!allLocked && (
            <>
              <AlignMenu />
              <PopTool label="Transparency" icon={<IconDroplet size={17} />}>
                <SliderRow label="Opacity" value={Math.round(opacity * 100)} min={0} max={100} suffix="%" onChange={(v) => store.updateSelected({ opacity: v / 100 }, "opacity")} />
              </PopTool>
              <Tool label="Flip horizontal" onClick={() => store.updateSelected((l) => ({ flipX: !l.flipX }))}>
                <IconFlipVertical size={17} />
              </Tool>
              <Tool label="Flip vertical" onClick={() => store.updateSelected((l) => ({ flipY: !l.flipY }))}>
                <IconFlipHorizontal size={17} />
              </Tool>
              <Tool label="Bring forward (Ctrl ])" onClick={() => store.arrange("forward")}>
                <IconLayersSubtract size={17} />
              </Tool>
            </>
          )}
          <Tool label={allLocked ? "Unlock" : "Lock"} active={allLocked} onClick={() => store.updateSelected({ locked: !allLocked })}>
            {allLocked ? <IconLock size={17} /> : <IconLockOpen size={17} />}
          </Tool>
          <Tool label="Duplicate (Ctrl D)" onClick={store.duplicateSelected} disabled={allLocked}>
            <IconCopy size={17} />
          </Tool>
          <Tool label="Delete (Del)" onClick={store.removeSelected} disabled={allLocked}>
            <IconTrash size={17} />
          </Tool>
        </>
      )}
    </Group>
  );
}

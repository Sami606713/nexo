"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Kbd,
  Loader,
  Modal,
  NumberInput,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowLeft,
  IconCategory,
  IconCheck,
  IconChevronDown,
  IconCloudCheck,
  IconCloudUpload,
  IconDimensions,
  IconDownload,
  IconKeyboard,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconPalette,
  IconPhoto,
  IconSend,
  IconSparkles,
  IconTemplate,
  IconTypography,
  IconUpload,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { api } from "@/lib/fetcher";
import { notifyError, notifySuccess } from "@/components/ui/notify";
import StudioCanvas, { type CanvasApi } from "./canvas/StudioCanvas";
import { ContextToolbar } from "./ContextToolbar";
import { LayersPanel } from "./LayersPanel";
import { StudioContext, type BrandAssets } from "./context";
import { uploadMedia } from "./client";
import { FORMATS, formatLabel, resizeScene, type Scene } from "./scene";
import { EditorStore, StoreContext, useEditorState } from "./store";
import { AiPanel } from "./panels/AiPanel";
import { BrandPanel } from "./panels/BrandPanel";
import { ElementsPanel } from "./panels/ElementsPanel";
import { PhotosPanel, useStockProviders } from "./panels/PhotosPanel";
import { TemplatesPanel } from "./panels/TemplatesPanel";
import { TextPanel } from "./panels/TextPanel";
import { UploadsPanel } from "./panels/UploadsPanel";
import { addImageLayer } from "./panels/common";
import { StudioStyles } from "./StudioStyles";

export interface EditorDesign {
  id: string;
  name: string;
  format: string;
  doc: Scene;
}

type SaveState = "saved" | "dirty" | "saving" | "error";
type PanelKey = "templates" | "text" | "elements" | "uploads" | "photos" | "brand" | "ai";

const PANELS: { key: PanelKey; label: string; icon: ComponentType<{ size?: number; stroke?: number }>; Comp: ComponentType }[] = [
  { key: "templates", label: "Templates", icon: IconTemplate, Comp: TemplatesPanel },
  { key: "text", label: "Text", icon: IconTypography, Comp: TextPanel },
  { key: "elements", label: "Elements", icon: IconCategory, Comp: ElementsPanel },
  { key: "uploads", label: "Uploads", icon: IconUpload, Comp: UploadsPanel },
  { key: "photos", label: "Photos", icon: IconPhoto, Comp: PhotosPanel },
  { key: "brand", label: "Brand", icon: IconPalette, Comp: BrandPanel },
  { key: "ai", label: "AI", icon: IconSparkles, Comp: AiPanel },
];

const isTyping = () => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

const formatKeyFor = (w: number, h: number) => FORMATS.find((f) => f.width === w && f.height === h)?.key ?? "custom";

export default function StudioEditor({ brandId, design, brand }: { brandId: string; design: EditorDesign; brand: BrandAssets }) {
  const store = useMemo(() => new EditorStore(design.doc), [design.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const canvas = useRef<CanvasApi | null>(null);
  const ctx = useMemo(() => ({ brandId, designId: design.id, brand, canvas }), [brandId, design.id, brand]);
  return (
    <StoreContext.Provider value={store}>
      <StudioContext.Provider value={ctx}>
        <StudioStyles />
        <EditorShell store={store} design={design} brandId={brandId} canvas={canvas} />
      </StudioContext.Provider>
    </StoreContext.Provider>
  );
}

function EditorShell({ store, design, brandId, canvas }: { store: EditorStore; design: EditorDesign; brandId: string; canvas: React.RefObject<CanvasApi | null> }) {
  const router = useRouter();
  const st = useEditorState();
  const stock = useStockProviders(brandId);
  const [panel, setPanel] = useState<PanelKey | null>(design.doc.layers.length ? "text" : "templates");
  const [showLayers, setShowLayers] = useState(true);
  const [name, setName] = useState(design.name);
  const [save, setSave] = useState<SaveState>("saved");
  const [exporting, setExporting] = useState<null | "download" | "post">(null);
  const [resizeOpen, setResizeOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);

  // ── autosave (debounced PATCH, 1.5s) ──
  const savedVersion = useRef(0);
  const saving = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSave = useCallback(async () => {
    if (saving.current) await saving.current;
    const { scene, version } = store.get();
    if (version === savedVersion.current) return;
    setSave("saving");
    const p = (async () => {
      try {
        const thumbnail = canvas.current?.thumbnail(480) ?? undefined;
        await api(`/api/brands/${brandId}/designs/${design.id}`, "PATCH", { doc: scene, format: formatKeyFor(scene.width, scene.height), thumbnail });
        savedVersion.current = version;
        setSave(store.get().version === version ? "saved" : "dirty");
      } catch (err) {
        console.error(err);
        setSave("error");
      }
    })();
    saving.current = p;
    await p;
    saving.current = null;
  }, [store, brandId, design.id, canvas]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    await doSave();
  }, [doSave]);

  useEffect(
    () =>
      store.subscribe(() => {
        if (store.get().version === savedVersion.current) return;
        setSave((s) => (s === "saving" ? s : "dirty"));
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void doSave(), 1500);
      }),
    [store, doSave],
  );

  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (store.get().version !== savedVersion.current) {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [store, flush]);

  // ── keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping() || store.get().editingTextId) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z" && !e.shiftKey) return e.preventDefault(), store.undo();
      if (mod && ((k === "z" && e.shiftKey) || k === "y")) return e.preventDefault(), store.redo();
      if (mod && k === "c") return void store.copy();
      if (mod && k === "x") return e.preventDefault(), store.cut();
      if (mod && k === "d") return e.preventDefault(), store.duplicateSelected();
      if (mod && k === "a") return e.preventDefault(), store.selectAll();
      if (mod && k === "s") return e.preventDefault(), void flush();
      if (mod && e.key === "]") return e.preventDefault(), store.arrange(e.shiftKey ? "front" : "forward");
      if (mod && e.key === "[") return e.preventDefault(), store.arrange(e.shiftKey ? "back" : "backward");
      if (e.key === "Delete" || e.key === "Backspace") return e.preventDefault(), store.removeSelected();
      if (e.key === "Escape") return store.select([]);
      if (e.key === "?" && e.shiftKey) return setKeysOpen(true);
      if (e.key === "Enter") {
        const sel = store.selectedLayers();
        if (sel.length === 1 && sel[0]!.type === "text" && !sel[0]!.locked) {
          e.preventDefault();
          store.setEditingText(sel[0]!.id);
        }
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const a = arrows[e.key];
      if (a && store.get().selected.length) {
        e.preventDefault();
        store.nudge(a[0], a[1]);
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping() || store.get().editingTextId) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      e.preventDefault();
      if (files.length) void uploadAndAdd(files);
      else store.paste();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }); // re-bind each render: cheap, avoids stale closures

  const uploadAndAdd = async (files: File[]) => {
    for (const f of files) {
      try {
        const m = await uploadMedia(brandId, f);
        await addImageLayer(store, m);
      } catch (err) {
        notifyError(err, "Upload failed");
      }
    }
  };

  // ── name ──
  const saveName = async () => {
    const n = name.trim() || "Untitled design";
    setName(n);
    if (n === design.name) return;
    try {
      await api(`/api/brands/${brandId}/designs/${design.id}`, "PATCH", { name: n });
      design.name = n;
    } catch (err) {
      notifyError(err);
    }
  };

  // ── export ──
  const renderPng = () => {
    store.select([]);
    store.setEditingText(null);
    const url = canvas.current?.exportDataUrl({ pixelRatio: 1 });
    if (!url) throw new Error("Couldn't render this design. An image may be blocking export (cross-origin).");
    return url;
  };

  const download = async () => {
    setExporting("download");
    try {
      await new Promise((r) => requestAnimationFrame(r));
      const url = renderPng();
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(name || "design").replace(/[^\w\- ]+/g, "").trim() || "design"}.png`;
      a.click();
    } catch (err) {
      notifyError(err);
    } finally {
      setExporting(null);
    }
  };

  const useInPost = async () => {
    setExporting("post");
    try {
      await flush();
      await new Promise((r) => requestAnimationFrame(r));
      const dataUrl = renderPng();
      const out = await api<{ media: { id: string } }>(`/api/brands/${brandId}/designs/${design.id}/export`, "POST", { dataUrl });
      notifySuccess("Design added to your media library");
      router.push(`/app/${brandId}/posts/new?mediaId=${out.media.id}`);
    } catch (err) {
      notifyError(err, "Export failed");
      setExporting(null);
    }
  };

  const back = async () => {
    await flush();
    router.push(`/app/${brandId}/studio`);
  };

  const visiblePanels = PANELS.filter((p) => p.key !== "photos" || stock.unsplash || stock.pexels);
  const Active = visiblePanels.find((p) => p.key === panel)?.Comp;

  return (
    <div className="studio-root">
      {/* ── Top bar ── */}
      <Group h={56} px="sm" gap="sm" wrap="nowrap" className="studio-topbar">
        <Tooltip label="Back to Studio">
          <ActionIcon variant="subtle" color="gray" size="lg" onClick={back} aria-label="Back to Studio">
            <IconArrowLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <TextInput
          variant="unstyled"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          maxLength={120}
          aria-label="Design name"
          styles={{ input: { fontWeight: 700, fontSize: 15, padding: "0 8px", borderRadius: 6, width: Math.min(320, Math.max(140, name.length * 9 + 24)) } }}
          className="studio-name"
        />
        <Tooltip label="Resize design">
          <Badge
            variant="light"
            color="gray"
            size="lg"
            radius="sm"
            leftSection={<IconDimensions size={13} />}
            rightSection={<IconChevronDown size={12} />}
            style={{ cursor: "pointer", textTransform: "none" }}
            onClick={() => setResizeOpen(true)}
          >
            {formatLabel(formatKeyFor(st.scene.width, st.scene.height), st.scene.width, st.scene.height)} · {st.scene.width}×{st.scene.height}
          </Badge>
        </Tooltip>
        <SaveIndicator state={save} onRetry={() => void flush()} />
        <div style={{ flex: 1 }} />
        <Group gap={2}>
          <Tooltip label="Undo (Ctrl Z)">
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={store.undo} disabled={!st.canUndo} aria-label="Undo">
              <IconArrowBackUp size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Redo (Ctrl Shift Z)">
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={store.redo} disabled={!st.canRedo} aria-label="Redo">
              <IconArrowForwardUp size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Keyboard shortcuts (?)">
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={() => setKeysOpen(true)} aria-label="Keyboard shortcuts" visibleFrom="md">
              <IconKeyboard size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={showLayers ? "Hide layers" : "Show layers"}>
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={() => setShowLayers((v) => !v)} aria-label="Toggle layers">
              {showLayers ? <IconLayoutSidebarRightCollapse size={18} /> : <IconLayoutSidebarRightExpand size={18} />}
            </ActionIcon>
          </Tooltip>
        </Group>
        <Button variant="default" leftSection={<IconDownload size={16} />} onClick={download} loading={exporting === "download"} disabled={!!exporting}>
          Download PNG
        </Button>
        <Button leftSection={<IconSend size={16} />} onClick={useInPost} loading={exporting === "post"} disabled={!!exporting}>
          Use in post
        </Button>
      </Group>

      <div className="studio-body">
        {/* ── Left rail ── */}
        <Stack gap={2} py={8} className="studio-rail">
          {visiblePanels.map((p) => (
            <UnstyledButton
              key={p.key}
              className="studio-rail-btn"
              data-active={panel === p.key || undefined}
              onClick={() => setPanel((cur) => (cur === p.key ? null : p.key))}
              aria-label={p.label}
            >
              <p.icon size={22} stroke={1.6} />
              <Text size="10px" fw={600} mt={2}>
                {p.label}
              </Text>
            </UnstyledButton>
          ))}
        </Stack>
        {Active && (
          <Box className="studio-panel">
            <ScrollArea h="100%" type="hover">
              <Box p="md">
                <Active />
              </Box>
            </ScrollArea>
          </Box>
        )}

        {/* ── Center ── */}
        <div className="studio-center">
          <ContextToolbar />
          <StudioCanvas ref={canvas} onDropFiles={uploadAndAdd} />
        </div>

        {showLayers && (
          <Box className="studio-layers">
            <LayersPanel />
          </Box>
        )}
      </div>

      <ResizeModal opened={resizeOpen} onClose={() => setResizeOpen(false)} store={store} />
      <ShortcutsModal opened={keysOpen} onClose={() => setKeysOpen(false)} />
      {exporting === "post" && (
        <div className="studio-busy">
          <Stack align="center" gap="xs">
            <Loader />
            <Text fw={600}>Preparing your post…</Text>
          </Stack>
        </div>
      )}
    </div>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "error")
    return (
      <Button size="compact-xs" variant="light" color="red" leftSection={<IconAlertTriangle size={13} />} onClick={onRetry}>
        Not saved — retry
      </Button>
    );
  const map = {
    saved: { icon: <IconCloudCheck size={15} />, text: "Saved" },
    dirty: { icon: <IconCloudUpload size={15} />, text: "Unsaved changes" },
    saving: { icon: <Loader size={12} />, text: "Saving…" },
  } as const;
  const m = map[state];
  return (
    <Group gap={6} c="dimmed" wrap="nowrap" visibleFrom="sm" style={{ minWidth: 120 }}>
      {m.icon}
      <Text size="xs" fw={500}>
        {m.text}
      </Text>
    </Group>
  );
}

function ResizeModal({ opened, onClose, store }: { opened: boolean; onClose: () => void; store: EditorStore }) {
  const st = useEditorState();
  const [w, setW] = useState<number>(st.scene.width);
  const [h, setH] = useState<number>(st.scene.height);
  useEffect(() => {
    if (opened) {
      setW(st.scene.width);
      setH(st.scene.height);
    }
  }, [opened, st.scene.width, st.scene.height]);
  const apply = (width: number, height: number) => {
    if (width === st.scene.width && height === st.scene.height) return onClose();
    store.commit((s) => resizeScene(s, width, height));
    onClose();
  };
  return (
    <Modal opened={opened} onClose={onClose} title="Resize design" size="lg" centered>
      <Text size="sm" c="dimmed" mb="md">
        Layers scale proportionally and stay on the page. You can undo a resize.
      </Text>
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        {FORMATS.map((f) => {
          const active = f.width === st.scene.width && f.height === st.scene.height;
          const r = f.width / f.height;
          return (
            <UnstyledButton key={f.key} onClick={() => apply(f.width, f.height)} className="studio-tile" p="sm" style={{ borderRadius: 10, border: `1px solid ${active ? "var(--mantine-color-indigo-5)" : "var(--mantine-color-default-border)"}` }}>
              <Box h={56} style={{ display: "grid", placeItems: "center" }}>
                <Box w={r >= 1 ? 52 : 52 * r} h={r >= 1 ? 52 / r : 52} style={{ borderRadius: 4, background: "var(--mantine-color-indigo-light)", border: "1.5px solid var(--mantine-color-indigo-5)" }} />
              </Box>
              <Text size="xs" fw={700} mt={6}>
                {f.label}
              </Text>
              <Group gap={4}>
                <Text size="xs" c="dimmed">
                  {f.width}×{f.height}
                </Text>
                {active && <IconCheck size={12} color="var(--mantine-color-indigo-5)" />}
              </Group>
            </UnstyledButton>
          );
        })}
      </SimpleGrid>
      <Group mt="lg" align="flex-end">
        <NumberInput label="Width" value={w} onChange={(v) => setW(Number(v) || 0)} min={50} max={8000} w={120} suffix=" px" />
        <NumberInput label="Height" value={h} onChange={(v) => setH(Number(v) || 0)} min={50} max={8000} w={120} suffix=" px" />
        <Button onClick={() => apply(Math.round(w), Math.round(h))} disabled={w < 50 || h < 50 || w > 8000 || h > 8000}>
          Resize to custom
        </Button>
      </Group>
    </Modal>
  );
}

const SHORTCUTS: [string, string[]][] = [
  ["Undo / redo", ["Ctrl", "Z"]],
  ["Redo", ["Ctrl", "Shift", "Z"]],
  ["Copy / paste", ["Ctrl", "C / V"]],
  ["Duplicate", ["Ctrl", "D"]],
  ["Select all", ["Ctrl", "A"]],
  ["Delete", ["Del"]],
  ["Nudge (×10 with Shift)", ["←↑→↓"]],
  ["Edit text", ["Enter"]],
  ["Bring forward / send back", ["Ctrl", "] / ["]],
  ["Zoom", ["Ctrl", "+ / −"]],
  ["Fit to screen", ["Ctrl", "0"]],
  ["Pan", ["Space", "drag"]],
  ["Keep proportions", ["Shift", "resize"]],
  ["Multi-select", ["Shift", "click"]],
];

function ShortcutsModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Modal opened={opened} onClose={onClose} title="Keyboard shortcuts" centered>
      <Stack gap={8}>
        {SHORTCUTS.map(([label, keys]) => (
          <Group key={label} justify="space-between">
            <Text size="sm">{label}</Text>
            <Group gap={4}>
              {keys.map((k) => (
                <Kbd key={k} size="xs">
                  {k}
                </Kbd>
              ))}
            </Group>
          </Group>
        ))}
      </Stack>
    </Modal>
  );
}


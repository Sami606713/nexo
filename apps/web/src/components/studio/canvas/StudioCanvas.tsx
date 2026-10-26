"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from "react";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { ActionIcon, Group as MGroup, Menu, Paper, Text as MText, Tooltip, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconMinus, IconPlus } from "@tabler/icons-react";
import { ensureSceneFonts } from "../client";
import type { Layer, TextLayer } from "../scene";
import { useEditorState, useStore } from "../store";
import { SceneSync, fontStyle, measureText } from "./render";

export interface CanvasApi {
  /** Render the page at native size × pixelRatio. Null if the canvas is tainted or not mounted. */
  exportDataUrl(opts?: { pixelRatio?: number; mimeType?: string; quality?: number }): string | null;
  thumbnail(maxSize?: number): string | null;
  fit(): void;
}

interface View {
  zoom: number;
  x: number;
  y: number;
}

const SNAP_PX = 6;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 5;
const ACCENT = "#6366f1";

const isTyping = () => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

interface Konvas {
  stage: Konva.Stage;
  main: Konva.Layer;
  world: Konva.Group;
  shadow: Konva.Rect;
  page: Konva.Group;
  guides: Konva.Group;
  overlay: Konva.Layer;
  tr: Konva.Transformer;
  lockTr: Konva.Transformer;
  marquee: Konva.Rect;
  sync: SceneSync;
}

type Handlers = {
  layerDown(e: KonvaEventObject<MouseEvent | TouchEvent>, id: string): void;
  dragStart(e: KonvaEventObject<DragEvent>, id: string): void;
  dragMove(e: KonvaEventObject<DragEvent>, id: string): void;
  dragEnd(e: KonvaEventObject<DragEvent>, id: string): void;
  dblClick(id: string): void;
  stageDown(e: KonvaEventObject<MouseEvent | TouchEvent>): void;
  stageMove(): void;
  stageUp(e: KonvaEventObject<MouseEvent | TouchEvent>): void;
  wheel(e: KonvaEventObject<WheelEvent>): void;
  transform(): void;
  transformEnd(): void;
  measure(id: string, h: number): void;
};

const StudioCanvas = forwardRef<CanvasApi, { onDropFiles?: (files: File[]) => void }>(function StudioCanvas({ onDropFiles }, ref) {
  const store = useStore();
  const st = useEditorState();
  const scene = st.scene;

  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const k = useRef<Konvas | null>(null);
  const handlers = useRef<Handlers | null>(null);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ zoom: 0.4, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [fontsVersion, setFontsVersion] = useState(0);
  const [space, setSpace] = useState(false);
  const spaceRef = useRef(false);
  spaceRef.current = space;
  const [shift, setShift] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [panning, setPanning] = useState(false);
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const marqueeRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const snapRef = useRef<{ v: number[]; h: number[] }>({ v: [], h: [] });

  // ── create the Konva stage once ──
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const stage = new Konva.Stage({ container: host, width: host.clientWidth || 800, height: host.clientHeight || 600 });
    const main = new Konva.Layer();
    const world = new Konva.Group();
    const shadow = new Konva.Rect({ name: "page-shadow", fill: "#ffffff", shadowColor: "#000", shadowOpacity: 0.18 });
    const page = new Konva.Group();
    const bg = new Konva.Group();
    const layers = new Konva.Group();
    const guides = new Konva.Group({ listening: false });
    page.add(bg, layers);
    world.add(shadow, page, guides);
    main.add(world);
    const overlay = new Konva.Layer();
    const tr = new Konva.Transformer({
      rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
      rotationSnapTolerance: 4,
      anchorSize: 10,
      anchorCornerRadius: 5,
      anchorStroke: ACCENT,
      anchorFill: "#ffffff",
      anchorStrokeWidth: 1.5,
      borderStroke: ACCENT,
      borderStrokeWidth: 1.5,
      rotateAnchorOffset: 28,
      ignoreStroke: true,
      flipEnabled: false,
      boundBoxFunc: (oldBox, newBox) => (Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 4 ? oldBox : newBox),
    });
    const lockTr = new Konva.Transformer({ resizeEnabled: false, rotateEnabled: false, borderStroke: "#f59e0b", borderDash: [4, 4] });
    const marquee = new Konva.Rect({ fill: "rgba(99,102,241,0.08)", stroke: ACCENT, strokeWidth: 1, visible: false, listening: false });
    overlay.add(tr, lockTr, marquee);
    stage.add(main, overlay);

    const h = () => handlers.current!;
    const sync = new SceneSync(bg, layers, { redraw: () => main.batchDraw(), onMeasure: (id, height) => h().measure(id, height) }, (g, id) => {
      g.on("mousedown touchstart", (e) => h().layerDown(e as KonvaEventObject<MouseEvent | TouchEvent>, id));
      g.on("dragstart", (e) => h().dragStart(e as KonvaEventObject<DragEvent>, id));
      g.on("dragmove", (e) => h().dragMove(e as KonvaEventObject<DragEvent>, id));
      g.on("dragend", (e) => h().dragEnd(e as KonvaEventObject<DragEvent>, id));
      g.on("dblclick dbltap", () => h().dblClick(id));
    });
    stage.on("mousedown touchstart", (e) => h().stageDown(e as KonvaEventObject<MouseEvent | TouchEvent>));
    stage.on("mousemove touchmove", () => h().stageMove());
    stage.on("mouseup touchend", (e) => h().stageUp(e as KonvaEventObject<MouseEvent | TouchEvent>));
    stage.on("wheel", (e) => h().wheel(e as KonvaEventObject<WheelEvent>));
    tr.on("transform", () => h().transform());
    tr.on("transformend", () => h().transformEnd());

    k.current = { stage, main, world, shadow, page, guides, overlay, tr, lockTr, marquee, sync };
    return () => {
      stage.destroy();
      k.current = null;
    };
  }, []);

  // ── sizing & fit ──
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (!size.w || !size.h) return;
    const zoom = Math.max(MIN_ZOOM, Math.min((size.w - 96) / scene.width, (size.h - 96) / scene.height));
    setView({ zoom, x: (size.w - scene.width * zoom) / 2, y: (size.h - scene.height * zoom) / 2 });
  }, [size.w, size.h, scene.width, scene.height]);

  const fittedFor = useRef("");
  useEffect(() => {
    const key = `${scene.width}x${scene.height}`;
    if (!size.w) return;
    if (fittedFor.current !== key) {
      fittedFor.current = key;
      fit();
    }
  }, [fit, scene.width, scene.height, size.w]);

  const zoomTo = useCallback(
    (zoom: number, at?: { x: number; y: number }) => {
      const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
      const v = viewRef.current;
      const p = at ?? { x: size.w / 2, y: size.h / 2 };
      const wx = (p.x - v.x) / v.zoom;
      const wy = (p.y - v.y) / v.zoom;
      setView({ zoom: z, x: p.x - wx * z, y: p.y - wy * z });
    },
    [size.w, size.h],
  );

  // ── fonts ──
  useEffect(() => {
    let alive = true;
    void ensureSceneFonts([scene]).then((changed) => alive && changed && setFontsVersion((v) => v + 1));
    return () => {
      alive = false;
    };
  }, [scene]);

  // ── modifier keys & zoom shortcuts ──
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShift(true);
      if (e.code === "Space" && !isTyping()) {
        e.preventDefault();
        setSpace(true);
      }
      if (isTyping() || !(e.ctrlKey || e.metaKey)) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        zoomTo(viewRef.current.zoom * 1.25);
      } else if (e.key === "-") {
        e.preventDefault();
        zoomTo(viewRef.current.zoom / 1.25);
      } else if (e.key === "0") {
        e.preventDefault();
        fit();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShift(false);
      if (e.code === "Space") setSpace(false);
    };
    const blur = () => {
      setShift(false);
      setSpace(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [zoomTo, fit]);

  const byId = useMemo(() => new Map(scene.layers.map((l) => [l.id, l])), [scene.layers]);
  const selectedLayers = st.selected.map((id) => byId.get(id)).filter((l): l is Layer => !!l);
  const single = selectedLayers.length === 1 ? selectedLayers[0]! : null;

  // ── snapping ──
  const collectSnapTargets = (exclude: Set<string>) => {
    const kk = k.current;
    const v = [0, scene.width / 2, scene.width];
    const h = [0, scene.height / 2, scene.height];
    if (kk) {
      for (const l of scene.layers) {
        if (exclude.has(l.id) || l.hidden) continue;
        const n = kk.sync.group(l.id);
        if (!n) continue;
        const r = n.getClientRect({ relativeTo: kk.page, skipShadow: true });
        if (r.width >= scene.width * 0.98 && r.height >= scene.height * 0.98) continue;
        v.push(r.x, r.x + r.width / 2, r.x + r.width);
        h.push(r.y, r.y + r.height / 2, r.y + r.height);
      }
    }
    snapRef.current = { v, h };
  };

  const drawGuides = (lines: { kind: "v" | "h"; pos: number }[]) => {
    const kk = k.current;
    if (!kk) return;
    kk.guides.destroyChildren();
    const z = viewRef.current.zoom;
    for (const g of lines) {
      const pts = g.kind === "v" ? [g.pos, -20 / z, g.pos, scene.height + 20 / z] : [-20 / z, g.pos, scene.width + 20 / z, g.pos];
      kk.guides.add(new Konva.Line({ points: pts, stroke: "#ec4899", strokeWidth: 1 / z, dash: [4 / z, 3 / z], listening: false }));
    }
    kk.main.batchDraw();
  };

  const pointer = () => k.current?.stage.getPointerPosition() ?? { x: 0, y: 0 };

  // Handlers read the latest render's values.
  handlers.current = {
    layerDown(e, id) {
      if (spaceRef.current || (e.evt as MouseEvent).button === 1) return;
      e.cancelBubble = true;
      if (store.get().editingTextId) return;
      const sel = store.get().selected;
      if ((e.evt as MouseEvent).shiftKey) store.toggleSelect(id);
      else if (!sel.includes(id)) store.select([id]);
    },
    dragStart(_e, id) {
      const sel = store.get().selected;
      if (!sel.includes(id)) store.select([id]);
      collectSnapTargets(new Set(sel.includes(id) ? sel : [id]));
    },
    dragMove(e) {
      const node = e.target as Konva.Group;
      const kk = k.current;
      if (!kk || (e.evt as MouseEvent | undefined)?.altKey) return drawGuides([]);
      const thr = SNAP_PX / viewRef.current.zoom;
      const r = node.getClientRect({ relativeTo: kk.page, skipShadow: true });
      const best = (edges: number[], targets: number[]) => {
        let out: { d: number; pos: number } | null = null;
        for (const e1 of edges)
          for (const t of targets) {
            const d = t - e1;
            if (Math.abs(d) <= thr && (!out || Math.abs(d) < Math.abs(out.d))) out = { d, pos: t };
          }
        return out;
      };
      const bv = best([r.x, r.x + r.width / 2, r.x + r.width], snapRef.current.v);
      const bh = best([r.y, r.y + r.height / 2, r.y + r.height], snapRef.current.h);
      if (bv) node.x(node.x() + bv.d);
      if (bh) node.y(node.y() + bh.d);
      drawGuides([...(bv ? [{ kind: "v" as const, pos: bv.pos }] : []), ...(bh ? [{ kind: "h" as const, pos: bh.pos }] : [])]);
    },
    dragEnd(_e, id) {
      drawGuides([]);
      const kk = k.current;
      if (!kk) return;
      const sel = store.get().selected;
      const ids = sel.includes(id) ? sel : [id];
      const pos = new Map<string, { x: number; y: number }>();
      for (const x of ids) {
        const n = kk.sync.group(x);
        if (n) pos.set(x, { x: Math.round(n.x() * 10) / 10, y: Math.round(n.y() * 10) / 10 });
      }
      store.updateLayers([...pos.keys()], (l) => pos.get(l.id) ?? {});
    },
    dblClick(id) {
      const l = byId.get(id);
      if (l?.type === "text" && !l.locked) {
        store.select([id]);
        store.setEditingText(id);
      }
    },
    stageDown(e) {
      const me = e.evt as MouseEvent;
      if (spaceRef.current || me.button === 1) {
        me.preventDefault?.();
        const p = pointer();
        panRef.current = { sx: p.x, sy: p.y, vx: viewRef.current.x, vy: viewRef.current.y };
        setPanning(true);
        return;
      }
      if (store.get().editingTextId) return;
      const t = e.target;
      const empty = t === k.current?.stage || t.name() === "bg" || t.name() === "page-shadow";
      if (!empty) return;
      if (!me.shiftKey) store.select([]);
      const p = pointer();
      marqueeRef.current = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    },
    stageMove() {
      const p = pointer();
      if (panRef.current) {
        const s = panRef.current;
        setView((v) => ({ ...v, x: s.vx + p.x - s.sx, y: s.vy + p.y - s.sy }));
        return;
      }
      const m = marqueeRef.current;
      const kk = k.current;
      if (!m || !kk) return;
      m.x2 = p.x;
      m.y2 = p.y;
      kk.marquee.setAttrs({ visible: true, x: Math.min(m.x1, m.x2), y: Math.min(m.y1, m.y2), width: Math.abs(m.x2 - m.x1), height: Math.abs(m.y2 - m.y1) });
      kk.overlay.batchDraw();
    },
    stageUp(e) {
      if (panRef.current) {
        panRef.current = null;
        setPanning(false);
      }
      const m = marqueeRef.current;
      const kk = k.current;
      marqueeRef.current = null;
      if (!m || !kk) return;
      kk.marquee.visible(false);
      kk.overlay.batchDraw();
      const box = { x: Math.min(m.x1, m.x2), y: Math.min(m.y1, m.y2), width: Math.abs(m.x2 - m.x1), height: Math.abs(m.y2 - m.y1) };
      if (box.width < 4 && box.height < 4) return;
      const hit = scene.layers
        .filter((l) => !l.hidden && !l.locked && !(l.width >= scene.width * 0.98 && l.height >= scene.height * 0.98))
        .filter((l) => {
          const n = kk.sync.group(l.id);
          if (!n) return false;
          const r = n.getClientRect();
          return r.x < box.x + box.width && r.x + r.width > box.x && r.y < box.y + box.height && r.y + r.height > box.y;
        })
        .map((l) => l.id);
      const prev = (e.evt as MouseEvent).shiftKey ? store.get().selected : [];
      store.select([...new Set([...prev, ...hit])]);
    },
    wheel(e) {
      e.evt.preventDefault();
      if (e.evt.ctrlKey || e.evt.metaKey) {
        zoomTo(viewRef.current.zoom * Math.exp(-e.evt.deltaY * 0.0045), pointer());
      } else {
        const dx = e.evt.shiftKey && !e.evt.deltaX ? e.evt.deltaY : e.evt.deltaX;
        const dy = e.evt.shiftKey && !e.evt.deltaX ? 0 : e.evt.deltaY;
        setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
      }
    },
    transform() {
      const tr = k.current?.tr;
      if (!tr || tr.nodes().length !== 1) return;
      const node = tr.nodes()[0]! as Konva.Group;
      const l = byId.get(node.id());
      if (l?.type !== "text") return;
      const anchor = tr.getActiveAnchor();
      if (anchor === "middle-left" || anchor === "middle-right") {
        const t = node.findOne<Konva.Text>(".text");
        if (!t) return;
        const w = Math.max(20, t.width() * node.scaleX());
        node.scale({ x: 1, y: 1 });
        t.width(w);
        node.findOne(".pill")?.visible(false);
      }
    },
    transformEnd() {
      const tr = k.current?.tr;
      if (!tr) return;
      const patches = new Map<string, Partial<Layer>>();
      for (const n of tr.nodes()) {
        const l = byId.get(n.id());
        if (!l) continue;
        const sx = Math.abs(n.scaleX());
        const sy = Math.abs(n.scaleY());
        n.scale({ x: 1, y: 1 });
        const p: Partial<Layer> = { x: n.x(), y: n.y(), rotation: Math.round(n.rotation() * 100) / 100 };
        if (l.type === "text") {
          const t = (n as Konva.Group).findOne<Konva.Text>(".text");
          const tp = p as Partial<TextLayer>;
          tp.width = Math.max(20, (t ? t.width() : l.width) * sx);
          if (Math.abs(sy - 1) > 0.001) {
            tp.fontSize = Math.max(4, Math.round(l.fontSize * sy * 10) / 10);
            tp.letterSpacing = l.letterSpacing * sy;
            if (l.pill) tp.pill = { ...l.pill, paddingX: l.pill.paddingX * sy, paddingY: l.pill.paddingY * sy, radius: l.pill.radius * sy };
          }
          tp.height = measureText({ ...l, ...tp } as TextLayer).height;
        } else {
          p.width = Math.max(4, l.width * sx);
          p.height = l.type === "line" ? l.height : Math.max(4, l.height * sy);
        }
        patches.set(l.id, p);
      }
      store.updateLayers([...patches.keys()], (l) => patches.get(l.id) ?? {});
    },
    measure(id, height) {
      store.updateLayers([id], { height: Math.round(height * 10) / 10 }, undefined, false);
    },
  };

  // ── push React state into Konva after every render ──
  const anchors = !single
    ? undefined
    : single.type === "line"
      ? ["middle-left", "middle-right"]
      : single.type === "text"
        ? ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"]
        : ["top-left", "top-center", "top-right", "middle-right", "middle-left", "bottom-left", "bottom-center", "bottom-right"];
  const keepRatio = shift || selectedLayers.length > 1 || (!!single && ["image", "icon", "text"].includes(single.type));

  useEffect(() => {
    const kk = k.current;
    if (!kk) return;
    if (size.w && (kk.stage.width() !== size.w || kk.stage.height() !== size.h)) kk.stage.size({ width: size.w, height: size.h });
    kk.world.setAttrs({ x: view.x, y: view.y, scaleX: view.zoom, scaleY: view.zoom });
    kk.shadow.setAttrs({ width: scene.width, height: scene.height, shadowBlur: 30 / view.zoom, shadowOffsetY: 6 / view.zoom });
    kk.page.setAttrs({ clipX: 0, clipY: 0, clipWidth: scene.width, clipHeight: scene.height });
    kk.sync.sync(scene, fontsVersion);
    for (const l of scene.layers) {
      const g = kk.sync.group(l.id);
      if (!g) continue;
      g.draggable(!l.locked && !space && st.editingTextId !== l.id);
      g.opacity(st.editingTextId === l.id ? 0 : l.opacity);
    }
    const visible = selectedLayers.filter((l) => !l.hidden && l.id !== st.editingTextId);
    const nodes = (ls: Layer[]) => ls.map((l) => kk.sync.group(l.id)).filter((n): n is Konva.Group => !!n);
    kk.tr.setAttrs({ keepRatio, enabledAnchors: anchors ?? ["top-left", "top-center", "top-right", "middle-right", "middle-left", "bottom-left", "bottom-center", "bottom-right"] });
    kk.tr.nodes(nodes(visible.filter((l) => !l.locked)));
    kk.lockTr.nodes(nodes(visible.filter((l) => l.locked)));
    kk.tr.forceUpdate();
    kk.stage.batchDraw();
  });

  // ── export ──
  useImperativeHandle(
    ref,
    (): CanvasApi => {
      const api: CanvasApi = {
        exportDataUrl(opts) {
          const kk = k.current;
          if (!kk) return null;
          const { zoom, x, y } = viewRef.current;
          kk.overlay.visible(false);
          kk.guides.visible(false);
          kk.world.setAttrs({ scaleX: 1, scaleY: 1, x: 0, y: 0 });
          try {
            return kk.stage.toDataURL({
              x: 0,
              y: 0,
              width: scene.width,
              height: scene.height,
              pixelRatio: opts?.pixelRatio ?? 1,
              mimeType: opts?.mimeType ?? "image/png",
              quality: opts?.quality,
            });
          } catch (err) {
            console.error("[studio] export failed", err);
            return null;
          } finally {
            kk.world.setAttrs({ scaleX: zoom, scaleY: zoom, x, y });
            kk.overlay.visible(true);
            kk.guides.visible(true);
            kk.stage.batchDraw();
          }
        },
        thumbnail(maxSize = 480) {
          return api.exportDataUrl({ pixelRatio: maxSize / Math.max(scene.width, scene.height), mimeType: "image/jpeg", quality: 0.82 });
        },
        fit,
      };
      return api;
    },
    [scene.width, scene.height, fit],
  );

  const editing = st.editingTextId ? byId.get(st.editingTextId) : undefined;
  const editingText = editing?.type === "text" ? editing : null;
  const zoomPct = Math.round(view.zoom * 100);

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        cursor: panning ? "grabbing" : space ? "grab" : "default",
        background: "var(--studio-canvas-bg)",
        outline: dragOver ? "3px dashed var(--mantine-color-indigo-5)" : undefined,
        outlineOffset: -12,
      }}
      onDragOver={(e) => {
        if (onDropFiles && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
        if (files.length && onDropFiles) {
          e.preventDefault();
          onDropFiles(files);
        }
      }}
    >
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />

      {editingText && <TextEditor key={editingText.id} layer={editingText} view={view} />}

      <Paper
        withBorder
        shadow="sm"
        radius="xl"
        px={6}
        py={4}
        style={{ position: "absolute", right: 16, bottom: 16, zIndex: 2 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <MGroup gap={2} wrap="nowrap">
          <Tooltip label="Zoom out (Ctrl −)">
            <ActionIcon variant="subtle" color="gray" radius="xl" onClick={() => zoomTo(view.zoom / 1.25)} aria-label="Zoom out">
              <IconMinus size={16} />
            </ActionIcon>
          </Tooltip>
          <Menu position="top" shadow="md" withinPortal>
            <Menu.Target>
              <UnstyledButton px={8} style={{ display: "flex", alignItems: "center", gap: 4 }} aria-label="Zoom level">
                <MText size="sm" fw={600} w={42} ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {zoomPct}%
                </MText>
                <IconChevronDown size={14} />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={fit} rightSection={<MText size="xs" c="dimmed">Ctrl 0</MText>}>
                Fit to screen
              </Menu.Item>
              {[0.5, 1, 2].map((z) => (
                <Menu.Item key={z} onClick={() => zoomTo(z)}>
                  {z * 100}%
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
          <Tooltip label="Zoom in (Ctrl +)">
            <ActionIcon variant="subtle" color="gray" radius="xl" onClick={() => zoomTo(view.zoom * 1.25)} aria-label="Zoom in">
              <IconPlus size={16} />
            </ActionIcon>
          </Tooltip>
        </MGroup>
      </Paper>
      <MText size="xs" c="dimmed" style={{ position: "absolute", left: 16, bottom: 20, pointerEvents: "none", userSelect: "none" }} visibleFrom="md">
        Space + drag to pan · Ctrl + scroll to zoom · Alt disables snapping
      </MText>
    </div>
  );
});

export default StudioCanvas;

function TextEditor({ layer: l, view }: { layer: TextLayer; view: View }) {
  const store = useStore();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(l.text);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, view.zoom]);

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save && value !== l.text) {
      const height = measureText({ ...l, text: value }).height;
      store.updateLayers([l.id], { text: value, height } as Partial<TextLayer>);
    }
    store.setEditingText(null);
  };

  const z = view.zoom;
  const style: CSSProperties = {
    position: "absolute",
    left: view.x + l.x * z,
    top: view.y + l.y * z,
    width: l.width * z,
    transform: `rotate(${l.rotation}deg)`,
    transformOrigin: "top left",
    font: `${fontStyle(l)} ${l.fontSize * z}px "${l.fontFamily}"`,
    lineHeight: l.lineHeight,
    letterSpacing: `${l.letterSpacing * z}px`,
    textAlign: l.align,
    textTransform: l.uppercase ? "uppercase" : undefined,
    textDecoration: l.underline ? "underline" : undefined,
    color: l.fill,
    background: l.pill ? l.pill.color : "transparent",
    border: "none",
    outline: "2px solid rgba(99,102,241,0.8)",
    outlineOffset: 4,
    padding: 0,
    margin: 0,
    resize: "none",
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    zIndex: 3,
    opacity: l.opacity,
  };
  return (
    <textarea
      ref={ref}
      value={value}
      spellCheck={false}
      style={style}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") finish(true);
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) finish(true);
      }}
    />
  );
}

"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { cloneScene, duplicateLayers, type Layer, type Scene } from "./scene";

export interface EditorState {
  scene: Scene;
  selected: string[];
  editingTextId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Bumps on every scene change (used by autosave). */
  version: number;
}

const HISTORY = 100;
const COALESCE_MS = 700;

let clipboard: Layer[] = [];

export class EditorStore {
  private state: EditorState;
  private past: Scene[] = [];
  private future: Scene[] = [];
  private lastKey: string | null = null;
  private lastAt = 0;
  private listeners = new Set<() => void>();

  constructor(scene: Scene) {
    this.state = { scene, selected: [], editingTextId: null, canUndo: false, canRedo: false, version: 0 };
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  get = () => this.state;

  private emit(patch: Partial<EditorState>) {
    this.state = { ...this.state, ...patch, canUndo: this.past.length > 0, canRedo: this.future.length > 0 };
    this.listeners.forEach((l) => l());
  }

  /**
   * Apply a scene change. `key` coalesces rapid edits of the same control (sliders, typing) into one undo step.
   * `history: false` updates silently (measurements).
   */
  commit(fn: (s: Scene) => Scene, opts: { key?: string; history?: boolean } = {}) {
    const prev = this.state.scene;
    const next = fn(prev);
    if (next === prev) return;
    if (opts.history !== false) {
      const now = Date.now();
      const coalesce = opts.key && opts.key === this.lastKey && now - this.lastAt < COALESCE_MS;
      if (!coalesce) {
        this.past.push(prev);
        if (this.past.length > HISTORY) this.past.shift();
      }
      this.future = [];
      this.lastKey = opts.key ?? null;
      this.lastAt = now;
    }
    const ids = new Set(next.layers.map((l) => l.id));
    this.emit({ scene: next, selected: this.state.selected.filter((id) => ids.has(id)), version: this.state.version + 1 });
  }

  undo = () => {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.state.scene);
    this.lastKey = null;
    const ids = new Set(prev.layers.map((l) => l.id));
    this.emit({ scene: prev, selected: this.state.selected.filter((id) => ids.has(id)), editingTextId: null, version: this.state.version + 1 });
  };

  redo = () => {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.state.scene);
    this.lastKey = null;
    const ids = new Set(next.layers.map((l) => l.id));
    this.emit({ scene: next, selected: this.state.selected.filter((id) => ids.has(id)), editingTextId: null, version: this.state.version + 1 });
  };

  select = (ids: string[]) => {
    const a = this.state.selected;
    if (a.length === ids.length && a.every((x, i) => x === ids[i])) return;
    this.emit({ selected: ids });
  };

  toggleSelect = (id: string) => {
    const s = this.state.selected;
    this.select(s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  };

  setEditingText = (id: string | null) => this.emit({ editingTextId: id });

  selectedLayers(): Layer[] {
    const set = new Set(this.state.selected);
    return this.state.scene.layers.filter((l) => set.has(l.id));
  }

  updateLayers(ids: string[], patch: Partial<Layer> | ((l: Layer) => Partial<Layer>), key?: string, history = true) {
    const set = new Set(ids);
    this.commit(
      (s) => ({
        ...s,
        layers: s.layers.map((l) => (set.has(l.id) ? ({ ...l, ...(typeof patch === "function" ? patch(l) : patch) } as Layer) : l)),
      }),
      { key, history },
    );
  }

  updateSelected(patch: Partial<Layer> | ((l: Layer) => Partial<Layer>), key?: string) {
    this.updateLayers(this.state.selected, patch, key);
  }

  addLayers(layers: Layer[], select = true) {
    this.commit((s) => ({ ...s, layers: [...s.layers, ...layers] }));
    if (select) this.select(layers.map((l) => l.id));
  }

  removeSelected = () => {
    const set = new Set(this.selectedLayers().filter((l) => !l.locked).map((l) => l.id));
    if (!set.size) return;
    this.commit((s) => ({ ...s, layers: s.layers.filter((l) => !set.has(l.id)) }));
    this.select([]);
  };

  duplicateSelected = () => {
    const copies = duplicateLayers(this.selectedLayers());
    if (copies.length) this.addLayers(copies);
  };

  copy = () => {
    clipboard = cloneScene(this.selectedLayers());
    return clipboard.length;
  };

  cut = () => {
    if (this.copy()) this.removeSelected();
  };

  paste = () => {
    if (!clipboard.length) return;
    const copies = duplicateLayers(clipboard, 24);
    clipboard = cloneScene(copies);
    this.addLayers(copies);
  };

  selectAll = () => this.select(this.state.scene.layers.filter((l) => !l.hidden && !l.locked).map((l) => l.id));

  /** Move one layer to an absolute index (0 = back). */
  moveLayer(id: string, toIndex: number) {
    this.commit((s) => {
      const from = s.layers.findIndex((l) => l.id === id);
      if (from < 0) return s;
      const layers = [...s.layers];
      const [item] = layers.splice(from, 1);
      layers.splice(Math.max(0, Math.min(layers.length, toIndex)), 0, item!);
      return { ...s, layers };
    });
  }

  arrange(dir: "forward" | "backward" | "front" | "back") {
    const set = new Set(this.state.selected);
    if (!set.size) return;
    this.commit((s) => {
      let layers = [...s.layers];
      if (dir === "front") layers = [...layers.filter((l) => !set.has(l.id)), ...layers.filter((l) => set.has(l.id))];
      else if (dir === "back") layers = [...layers.filter((l) => set.has(l.id)), ...layers.filter((l) => !set.has(l.id))];
      else if (dir === "forward") {
        for (let i = layers.length - 2; i >= 0; i--)
          if (set.has(layers[i]!.id) && !set.has(layers[i + 1]!.id)) [layers[i], layers[i + 1]] = [layers[i + 1]!, layers[i]!];
      } else {
        for (let i = 1; i < layers.length; i++)
          if (set.has(layers[i]!.id) && !set.has(layers[i - 1]!.id)) [layers[i], layers[i - 1]] = [layers[i - 1]!, layers[i]!];
      }
      return { ...s, layers };
    });
  }

  nudge(dx: number, dy: number) {
    const ids = this.selectedLayers().filter((l) => !l.locked).map((l) => l.id);
    if (ids.length) this.updateLayers(ids, (l) => ({ x: l.x + dx, y: l.y + dy }), "nudge");
  }
}

export const StoreContext = createContext<EditorStore | null>(null);

export function useStore(): EditorStore {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore outside Studio");
  return s;
}

export function useEditorState(): EditorState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

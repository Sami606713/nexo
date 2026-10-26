"use client";

import { useEffect, useRef, useState } from "react";
import Konva from "konva";
import { ensureSceneFonts } from "../client";
import type { Scene } from "../scene";
import { SceneSync } from "./render";

/** Static, non-interactive render of a scene scaled to `width` px (lazy — renders once visible). */
export default function ScenePreview({ scene, width }: { scene: Scene; width: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const stageRef = useRef<{ stage: Konva.Stage; world: Konva.Group; sync: SceneSync } | null>(null);
  const scale = width / scene.width;
  const height = Math.round(scene.height * scale);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !ref.current) return;
    const stage = new Konva.Stage({ container: ref.current, width, height, listening: false });
    const layer = new Konva.Layer({ listening: false });
    const world = new Konva.Group();
    const bg = new Konva.Group();
    const layers = new Konva.Group();
    world.add(bg, layers);
    layer.add(world);
    stage.add(layer);
    const sync = new SceneSync(bg, layers, { redraw: () => layer.batchDraw() });
    stageRef.current = { stage, world, sync };
    return () => {
      stage.destroy();
      stageRef.current = null;
    };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = stageRef.current;
    if (!s) return;
    let alive = true;
    s.stage.size({ width, height });
    s.world.setAttrs({ scaleX: scale, scaleY: scale, clipX: 0, clipY: 0, clipWidth: scene.width, clipHeight: scene.height });
    s.sync.sync(scene, 0);
    s.stage.batchDraw();
    void ensureSceneFonts([scene]).then((changed) => {
      if (!alive || !changed || !stageRef.current) return;
      stageRef.current.sync.sync(scene, 1);
      stageRef.current.stage.batchDraw();
    });
    // Fonts may already be loaded by another preview; re-measure once shortly after anyway.
    const t = setTimeout(() => {
      if (!alive || !stageRef.current) return;
      stageRef.current.sync.sync(scene, 2);
      stageRef.current.stage.batchDraw();
    }, 600);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [visible, scene, width, height, scale]);

  return <div ref={ref} style={{ width, height, lineHeight: 0, overflow: "hidden" }} />;
}

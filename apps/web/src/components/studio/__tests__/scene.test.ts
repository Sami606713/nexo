import { describe, expect, it } from "vitest";
import { applyBrandColors, createShape, createText, emptyScene, layerBounds, resizeScene, sceneColors, type Scene } from "../scene";
import { parseScene, safeParseScene } from "../scene-schema";
import { TEMPLATES, instantiateTemplate } from "../templates";
import { FORMATS } from "../scene";
import { FONT_FAMILIES } from "../fonts";
import { STUDIO_ICONS } from "../icons";

const inside = (s: Scene, b: ReturnType<typeof layerBounds>, tol = 1) =>
  b.x >= -tol && b.y >= -tol && b.right <= s.width + tol && b.bottom <= s.height + tol;
const intersects = (s: Scene, b: ReturnType<typeof layerBounds>) => b.right > 0 && b.bottom > 0 && b.x < s.width && b.y < s.height;

describe("templates", () => {
  it("has at least 24 templates covering every category and orientation", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(24);
    expect(new Set(TEMPLATES.map((t) => t.category)).size).toBe(8);
    const orient = new Set(TEMPLATES.map((t) => { const r = t.scene.width / t.scene.height; return r === 1 ? "sq" : r > 1 ? "land" : r < 0.65 ? "story" : "portrait"; }));
    expect(orient).toEqual(new Set(["sq", "land", "story", "portrait"]));
  });

  it("template ids are unique", () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  for (const t of TEMPLATES) {
    describe(t.id, () => {
      it("parses with the scene schema", () => {
        expect(() => parseScene(t.scene)).not.toThrow();
      });
      it("matches its format size", () => {
        const f = FORMATS.find((x) => x.key === t.format);
        expect(f, `unknown format ${t.format}`).toBeDefined();
        expect([t.scene.width, t.scene.height]).toEqual([f!.width, f!.height]);
      });
      it("has unique layer ids", () => {
        const ids = t.scene.layers.map((l) => l.id);
        expect(new Set(ids).size).toBe(ids.length);
      });
      it("keeps text and icons inside the canvas and every layer visible", () => {
        for (const l of t.scene.layers) {
          const b = layerBounds(l);
          if (l.type === "text" || l.type === "icon") expect(inside(t.scene, b), `${l.id} out of bounds`).toBe(true);
          else expect(intersects(t.scene, b), `${l.id} not visible`).toBe(true);
        }
      });
      it("uses curated fonts and known icons", () => {
        for (const l of t.scene.layers) {
          if (l.type === "text") expect(FONT_FAMILIES).toContain(l.fontFamily);
          if (l.type === "icon") expect(STUDIO_ICONS[l.icon], l.icon).toBeDefined();
        }
      });
      it("declares accents that appear in the scene", () => {
        const colors = sceneColors(t.scene);
        expect(colors).toContain(t.accents[0]!.toLowerCase());
      });
    });
  }
});

describe("brand colours", () => {
  it("swaps accents for brand colours and leaves neutrals alone", () => {
    const t = TEMPLATES[0]!;
    const out = instantiateTemplate(t, ["#123456", "#abcdef"]);
    const colors = sceneColors(out);
    expect(colors).toContain("#123456");
    expect(colors).not.toContain(t.accents[0]!.toLowerCase());
    expect(colors).toContain("#ffffff");
  });
  it("is a no-op copy without brand colours", () => {
    const s = emptyScene(100, 100, "#ff0000");
    const out = applyBrandColors(s, ["#ff0000"], []);
    expect(out).toEqual(s);
    expect(out).not.toBe(s);
  });
});

describe("resizeScene", () => {
  const scene: Scene = { ...emptyScene(1080, 1080), layers: [createText({ width: 1080, height: 1080 }, "heading"), createShape({ width: 1080, height: 1080 }, "rect")] };
  scene.layers.push({ ...(createShape(scene, "rect") as Extract<Scene["layers"][number], { type: "rect" }>), x: 0, y: 0, width: 1080, height: 200, id: "bleed" });

  it("changes canvas size and scales fonts uniformly", () => {
    const out = resizeScene(scene, 1080, 1920);
    expect([out.width, out.height]).toEqual([1080, 1920]);
    const t0 = scene.layers[0] as Extract<Scene["layers"][number], { type: "text" }>;
    const t1 = out.layers[0] as typeof t0;
    expect(t1.fontSize).toBeCloseTo(t0.fontSize * 1, 5); // min(1, 1.78)
    const half = resizeScene(scene, 540, 540).layers[0] as typeof t0;
    expect(half.fontSize).toBeCloseTo(t0.fontSize / 2, 5);
  });

  it("keeps non-distorted aspect ratio for regular layers", () => {
    const out = resizeScene(scene, 1600, 900);
    const a = scene.layers[1]!;
    const b = out.layers[1]!;
    expect(b.width / b.height).toBeCloseTo(a.width / a.height, 3);
  });

  it("stretches full-bleed layers along the bleeding axis", () => {
    const out = resizeScene(scene, 1600, 900);
    const bleed = out.layers.find((l) => l.id === "bleed")!;
    expect(bleed.width).toBeCloseTo(1600, 1);
  });

  it("keeps layers that were inside the canvas inside it, for every format", () => {
    for (const t of TEMPLATES.slice(0, 12)) {
      for (const f of FORMATS) {
        const out = resizeScene(t.scene, f.width, f.height);
        t.scene.layers.forEach((l, i) => {
          if (l.rotation !== 0 || !inside(t.scene, layerBounds(l))) return;
          expect(inside(out, layerBounds(out.layers[i]!), 2), `${t.id}/${l.id} → ${f.key}`).toBe(true);
        });
        expect(safeParseScene(out)).not.toBeNull();
      }
    }
  });

  it("preserves layer ids and order", () => {
    const out = resizeScene(scene, 1200, 630);
    expect(out.layers.map((l) => l.id)).toEqual(scene.layers.map((l) => l.id));
  });
});

describe("schema", () => {
  it("rejects garbage", () => {
    expect(safeParseScene({ version: 2 })).toBeNull();
    expect(safeParseScene({ ...emptyScene(100, 100), layers: [{ id: "x", type: "blob" }] })).toBeNull();
  });
});

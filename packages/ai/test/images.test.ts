import { describe, expect, it } from "vitest";
import {
  brandPalette,
  choosePalette,
  createImageService,
  generateLocalArtwork,
  nearestAspectRatio,
  nearestOpenAiSize,
  renderLocalArtwork,
  shortTitle,
} from "../src/images";

const base = { prompt: "Launch week for our new AI scheduling app", width: 1080, height: 1350 };

function svgSize(svg: string) {
  const m = /^<svg[^>]*\swidth="(\d+)"\s+height="(\d+)"\s+viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  return m ? { w: Number(m[1]), h: Number(m[2]), vw: Number(m[3]), vh: Number(m[4]) } : null;
}

describe("local artwork generator", () => {
  it("renders well-formed SVG at the exact requested size for every style", () => {
    for (const style of [undefined, "photo", "illustration", "3d", "minimal", "brand"] as const) {
      for (const [width, height] of [[1080, 1080], [1080, 1350], [1200, 675], [1000, 1500]] as const) {
        for (let v = 0; v < 3; v++) {
          const svg = renderLocalArtwork({ ...base, width, height, style }, v);
          expect(svg.startsWith("<svg")).toBe(true);
          expect(svg.endsWith("</svg>")).toBe(true);
          expect(svgSize(svg)).toEqual({ w: width, h: height, vw: width, vh: height });
          expect(svg).not.toMatch(/NaN|undefined|Infinity/);
          // balanced tags (rough well-formedness check)
          const open = (svg.match(/<(?!\/)[a-zA-Z]+[^>]*[^/]>/g) ?? []).length;
          const close = (svg.match(/<\/[a-zA-Z]+>/g) ?? []).length;
          expect(open).toBe(close);
        }
      }
    }
  });

  it("is deterministic for the same prompt and varies between variants / prompts", () => {
    const a = renderLocalArtwork(base, 0);
    expect(renderLocalArtwork(base, 0)).toBe(a);
    expect(renderLocalArtwork(base, 1)).not.toBe(a);
    expect(renderLocalArtwork({ ...base, prompt: "Autumn menu at our neighbourhood bakery" }, 0)).not.toBe(a);
  });

  it("only draws text for the minimal style", () => {
    for (const style of ["photo", "illustration", "3d", "brand"] as const) expect(renderLocalArtwork({ ...base, style })).not.toContain("<text");
    const svg = renderLocalArtwork({ ...base, style: "minimal" });
    expect(svg).toContain("<text");
    expect(svg).toContain("Launch Week");
  });

  it("escapes the title", () => {
    const svg = renderLocalArtwork({ ...base, prompt: "Tips & <tricks> for founders", style: "minimal" });
    expect(svg).not.toContain("<tricks>");
  });

  it("clamps absurd sizes", () => {
    expect(svgSize(renderLocalArtwork({ ...base, width: 10, height: 99999 }))).toEqual({ w: 64, h: 4096, vw: 64, vh: 4096 });
  });

  it("uses brand colours when given and keyword palettes otherwise", () => {
    expect(choosePalette({ prompt: "x", colors: ["#FF5A1F"] }).colors[0]).toBe("#ff5a1f");
    expect(brandPalette(["#123", "nope"]).colors).toHaveLength(5);
    expect(choosePalette({ prompt: "Summer beach travel deals" }).name).toBe("ocean");
    expect(choosePalette({ prompt: "Our organic garden and sustainable farm" }).name).toBe("forest");
    expect(renderLocalArtwork({ ...base, colors: ["#ff5a1f"], style: "brand" })).toContain("#ff5a1f");
  });

  it("derives short titles", () => {
    expect(shortTitle("Create an image of a cozy coffee shop at sunrise with people")).toBe("Cozy Coffee Shop at Sunrise");
    expect(shortTitle("!!!")).toBe("");
    expect(shortTitle("a".repeat(100)).length).toBeLessThanOrEqual(32);
  });

  it("generates `count` images (SVG when rasterizing is off)", async () => {
    const out = await generateLocalArtwork({ ...base, count: 3 }, { rasterize: false });
    expect(out).toHaveLength(3);
    for (const img of out) {
      expect(img.mime).toBe("image/svg+xml");
      expect(img.provider).toBe("local-art");
      expect([img.width, img.height]).toEqual([1080, 1350]);
    }
  });
});

describe("image service", () => {
  it("picks local art without keys and falls back to it when a provider fails", async () => {
    const svc = createImageService({ env: {}, rasterize: false });
    expect(svc.provider()).toBe("local-art");
    const failing = createImageService({
      env: { OPENAI_API_KEY: "sk-test" },
      rasterize: false,
      fetch: (async () => new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 })) as typeof fetch,
    });
    expect(failing.provider()).toBe("openai");
    const out = await failing.generate({ ...base, count: 2 });
    expect(out.map((o) => o.provider)).toEqual(["local-art", "local-art"]);
  });

  it("maps sizes to provider presets", () => {
    expect(nearestOpenAiSize(1080, 1080)).toEqual([1024, 1024]);
    expect(nearestOpenAiSize(1080, 1350)).toEqual([1024, 1536]);
    expect(nearestOpenAiSize(1200, 675)).toEqual([1536, 1024]);
    expect(nearestAspectRatio(1080, 1350)).toBe("4:5");
    expect(nearestAspectRatio(1920, 1080)).toBe("16:9");
  });
});

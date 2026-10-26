import { PT, SQ, ST, XP, YT, linear, radial, softShadow, template } from "./kit";

export const launchTemplates = [
  template(
    { id: "launch-introducing", name: "Introducing", category: "launch", format: "instagram_post", accents: ["#a855f7", "#06b6d4"], tags: ["launch", "product", "gradient"] },
    SQ,
    { type: "color", color: "#09090b" },
    (k) => {
      k.ellipse({ x: 190, y: 330, w: 700, h: 700, gradient: radial("#a855f7", "#09090b"), fill: "#a855f7", opacity: 0.85 });
      k.rect({ x: 340, y: 430, w: 400, h: 400, gradient: linear(45, "#a855f7", "#06b6d4"), fill: "#a855f7", radius: 96, rotation: 0, shadow: softShadow(0.5, 80, 30) });
      k.icon({ x: 440, y: 530, w: 200, icon: "sparkles", color: "#ffffff", strokeWidth: 1.4 });
      k.text({ x: 80, y: 110, w: 920, text: "INTRODUCING", size: 30, weight: 700, color: "#a1a1aa", spacing: 12, align: "center" });
      k.text({ x: 80, y: 170, w: 920, text: "Aurora 2.0", size: 120, font: "Sora", weight: 800, color: "#ffffff", align: "center", lineHeight: 1.05 });
      k.text({ x: 80, y: 920, w: 920, text: "Smarter. Faster. Yours. — Available today", size: 32, weight: 500, color: "#d4d4d8", align: "center" });
    },
  ),
  template(
    { id: "launch-coming-soon-story", name: "Coming soon countdown", category: "launch", format: "instagram_story", accents: ["#f43f5e", "#fb923c"], tags: ["teaser", "countdown", "story"] },
    ST,
    { type: "gradient", gradient: linear(90, "#18181b", "#27272a") },
    (k) => {
      k.text({ x: 90, y: 300, w: 900, text: "SOMETHING NEW IS", size: 40, weight: 700, color: "#a1a1aa", spacing: 8, align: "center" });
      k.text({ x: 40, y: 380, w: 1000, text: "COMING", size: 270, font: "Anton", color: "#ffffff", align: "center", lineHeight: 1 });
      k.text({ x: 40, y: 660, w: 1000, text: "SOON", size: 270, font: "Anton", color: "#f43f5e", align: "center", lineHeight: 1 });
      const units = [
        ["03", "DAYS"],
        ["12", "HRS"],
        ["45", "MIN"],
      ] as const;
      units.forEach(([n, u], i) => {
        const x = 120 + i * 300;
        k.rect({ x, y: 1110, w: 240, h: 280, fill: "#f43f5e", gradient: linear(90, "#f43f5e", "#fb923c"), radius: 36 });
        k.text({ x, y: 1150, w: 240, text: n, size: 130, font: "Space Grotesk", weight: 700, color: "#ffffff", align: "center", lineHeight: 1.1 });
        k.text({ x, y: 1310, w: 240, text: u, size: 32, weight: 700, color: "#fff1f2", align: "center", spacing: 4 });
      });
      k.text({ x: 90, y: 1640, w: 900, text: "Turn on notifications 🔔", size: 42, weight: 600, color: "#e4e4e7", align: "center" });
    },
  ),
  template(
    { id: "launch-feature-grid", name: "What's new grid", category: "launch", format: "instagram_portrait", accents: ["#4f46e5", "#e0e7ff"], tags: ["features", "update", "saas"] },
    PT,
    { type: "color", color: "#f8fafc" },
    (k) => {
      k.text({ x: 80, y: 90, w: 920, text: "WHAT'S NEW IN V3", size: 28, weight: 700, color: "#4f46e5", spacing: 6 });
      k.text({ x: 80, y: 140, w: 920, text: "Four upgrades\nyou asked for.", size: 92, font: "Space Grotesk", weight: 700, color: "#0f172a", lineHeight: 1.05 });
      const feats = [
        ["bolt", "2× faster", "Pages load before you blink."],
        ["lock", "SSO & roles", "Enterprise-grade access."],
        ["chart-line", "Live analytics", "See results in real time."],
        ["world", "12 languages", "Speak to every customer."],
      ] as const;
      feats.forEach(([icon, title, body], i) => {
        const x = 80 + (i % 2) * 470;
        const y = 420 + Math.floor(i / 2) * 420;
        k.rect({ x, y, w: 450, h: 390, fill: "#ffffff", radius: 32, stroke: "#e2e8f0", strokeWidth: 2 });
        k.rect({ x: x + 40, y: y + 40, w: 110, h: 110, fill: "#e0e7ff", radius: 28 });
        k.icon({ x: x + 62, y: y + 62, w: 66, icon, color: "#4f46e5" });
        k.text({ x: x + 40, y: y + 190, w: 380, text: title, size: 44, weight: 700, color: "#0f172a", font: "Space Grotesk" });
        k.text({ x: x + 40, y: y + 255, w: 380, text: body, size: 28, color: "#64748b", lineHeight: 1.35 });
      });
      k.text({ x: 80, y: 1270, w: 920, text: "Update now — it's free for every plan", size: 28, weight: 600, color: "#4f46e5" });
    },
  ),
  template(
    { id: "launch-x-hero", name: "Launch day hero", category: "launch", format: "x_post", accents: ["#10b981", "#0ea5e9"], tags: ["launch", "announcement"] },
    XP,
    { type: "gradient", gradient: linear(135, "#ecfdf5", "#e0f2fe") },
    (k) => {
      k.text({ x: 110, y: 130, w: 400, text: "🚀  Launch day", size: 30, weight: 700, color: "#065f46", pill: { color: "#a7f3d0", paddingX: 26, paddingY: 14, radius: 999 } });
      k.text({ x: 110, y: 250, w: 820, text: "Meet Pocket —\nyour finances,\nfinally calm.", size: 104, font: "Outfit", weight: 800, color: "#022c22", lineHeight: 1.04 });
      k.text({ x: 110, y: 640, w: 760, text: "Budgets that build themselves. Free on iOS & Android.", size: 32, color: "#047857" });
      k.rect({ x: 1060, y: 90, w: 400, h: 720, fill: "#0f172a", radius: 64, shadow: softShadow(0.3, 60, 30) });
      k.rect({ x: 1090, y: 120, w: 340, h: 660, fill: "#10b981", gradient: linear(90, "#10b981", "#0ea5e9"), radius: 44 });
      k.text({ x: 1110, y: 200, w: 300, text: "$2,480", size: 72, font: "Space Grotesk", weight: 700, color: "#ffffff", align: "center" });
      k.text({ x: 1110, y: 290, w: 300, text: "saved this year", size: 26, color: "#ecfdf5", align: "center" });
      k.rect({ x: 1130, y: 420, w: 260, h: 70, fill: "#ffffff", opacity: 0.25, radius: 20 });
      k.rect({ x: 1130, y: 510, w: 200, h: 70, fill: "#ffffff", opacity: 0.25, radius: 20 });
      k.rect({ x: 1130, y: 600, w: 240, h: 70, fill: "#ffffff", opacity: 0.25, radius: 20 });
    },
  ),
  template(
    { id: "launch-yt-review", name: "Unboxing thumbnail", category: "launch", format: "youtube_thumbnail", accents: ["#facc15", "#2563eb"], tags: ["youtube", "review", "thumbnail"] },
    YT,
    { type: "color", color: "#2563eb" },
    (k) => {
      k.rect({ x: 700, y: 0, w: 580, h: 720, fill: "#facc15" });
      k.rect({ x: 820, y: 170, w: 340, h: 380, fill: "#ffffff", radius: 40, rotation: 0, shadow: softShadow(0.3, 40, 20) });
      k.icon({ x: 890, y: 260, w: 200, icon: "device-mobile", color: "#2563eb", strokeWidth: 1.3 });
      k.text({ x: 60, y: 120, w: 640, text: "IS IT\nWORTH\nIT?", size: 150, font: "Anton", color: "#ffffff", lineHeight: 0.98, shadow: softShadow(0.35, 0, 8) });
      k.text({ x: 60, y: 600, w: 600, text: "Honest 30-day review", size: 36, weight: 800, color: "#facc15" });
    },
  ),
];

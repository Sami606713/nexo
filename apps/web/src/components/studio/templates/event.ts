import { PT, SQ, ST, XP, YT, linear, radial, softShadow, template } from "./kit";

export const eventTemplates = [
  template(
    { id: "event-webinar", name: "Live webinar", category: "event", format: "x_post", accents: ["#6366f1", "#f472b6"], tags: ["webinar", "online", "talk"] },
    XP,
    { type: "color", color: "#0b1020" },
    (k) => {
      k.ellipse({ x: 1000, y: -200, w: 800, h: 800, gradient: radial("#6366f1", "#0b1020"), fill: "#6366f1", opacity: 0.9 });
      k.text({ x: 110, y: 120, w: 300, text: "● LIVE WEBINAR", size: 28, weight: 700, color: "#ffffff", spacing: 3, pill: { color: "#f472b6", paddingX: 22, paddingY: 12, radius: 999 } });
      k.text({ x: 110, y: 230, w: 1000, text: "Growing on social\nwithout burning out", size: 100, font: "Sora", weight: 800, color: "#ffffff", lineHeight: 1.05 });
      k.icon({ x: 110, y: 530, w: 52, icon: "calendar-event", color: "#a5b4fc" });
      k.text({ x: 180, y: 538, w: 600, text: "Thursday, May 14 · 6 PM CET", size: 36, weight: 600, color: "#e0e7ff" });
      k.line({ x: 110, y: 640, w: 1380, h: 2, stroke: "#334155" });
      k.ellipse({ x: 110, y: 700, w: 110, h: 110, fill: "#f472b6" });
      k.text({ x: 110, y: 730, w: 110, text: "AR", size: 40, weight: 800, color: "#ffffff", align: "center" });
      k.text({ x: 250, y: 712, w: 600, text: "Ana Ruiz", size: 34, weight: 700, color: "#ffffff" });
      k.text({ x: 250, y: 760, w: 600, text: "Head of Content, Brightside", size: 26, color: "#94a3b8" });
      k.text({ x: 1090, y: 735, w: 400, text: "Free · Save your seat", size: 32, weight: 700, color: "#0b1020", align: "center", pill: { color: "#ffffff", paddingX: 28, paddingY: 18, radius: 999 } });
    },
  ),
  template(
    { id: "event-music-night", name: "Live music night", category: "event", format: "instagram_portrait", accents: ["#f97316", "#facc15", "#9333ea"], tags: ["music", "party", "poster"] },
    PT,
    { type: "gradient", gradient: linear(90, "#9333ea", "#f97316") },
    (k) => {
      k.ellipse({ x: 190, y: 120, w: 700, h: 700, fill: "#facc15", opacity: 0.95, name: "Sun" });
      k.rect({ x: 190, y: 500, w: 700, h: 30, fill: "#9333ea", opacity: 0.5 });
      k.rect({ x: 190, y: 580, w: 700, h: 24, fill: "#9333ea", opacity: 0.5 });
      k.rect({ x: 190, y: 650, w: 700, h: 18, fill: "#9333ea", opacity: 0.5 });
      k.text({ x: 60, y: 840, w: 960, text: "LIVE TONIGHT", size: 160, font: "Bebas Neue", color: "#ffffff", align: "center", lineHeight: 1, shadow: softShadow(0.25, 24, 8) });
      k.text({ x: 60, y: 1010, w: 960, text: "The Neon Tides + special guests", size: 42, font: "Oswald", weight: 500, color: "#fff7ed", align: "center" });
      k.text({ x: 60, y: 1120, w: 960, text: "FRI 21.06  ·  DOORS 8 PM  ·  THE WAREHOUSE", size: 30, font: "Oswald", weight: 600, color: "#ffffff", align: "center", spacing: 3 });
    },
  ),
  template(
    { id: "event-workshop-story", name: "Workshop story", category: "event", format: "instagram_story", accents: ["#0891b2", "#fde68a"], tags: ["workshop", "class", "story"] },
    ST,
    { type: "color", color: "#ecfeff" },
    (k) => {
      k.rect({ x: 0, y: 0, w: 1080, h: 1100, fill: "#0891b2" });
      k.ellipse({ x: 600, y: 120, w: 380, h: 380, fill: "#fde68a" });
      k.icon({ x: 690, y: 210, w: 200, icon: "palette", color: "#0891b2", strokeWidth: 1.5 });
      k.text({ x: 90, y: 560, w: 900, text: "SATURDAY WORKSHOP", size: 34, weight: 700, color: "#fde68a", spacing: 6 });
      k.text({ x: 90, y: 630, w: 900, text: "Watercolour\nfor beginners", size: 128, font: "Fraunces", weight: 700, color: "#ffffff", lineHeight: 1.02 });
      const rows = [
        ["calendar-event", "June 8, 10:00 – 13:00"],
        ["map-pin", "Studio 4, Riverside Arts"],
        ["ticket", "$35 · materials included"],
      ] as const;
      rows.forEach(([icon, t], i) => {
        const y = 1200 + i * 120;
        k.icon({ x: 90, y, w: 64, icon, color: "#0891b2" });
        k.text({ x: 190, y: y + 8, w: 800, text: t, size: 42, weight: 600, color: "#164e63" });
      });
      k.text({ x: 90, y: 1650, w: 900, text: "Only 12 spots — book via link", size: 40, weight: 700, color: "#ffffff", align: "center", pill: { color: "#0891b2", paddingX: 36, paddingY: 22, radius: 999 } });
    },
  ),
  template(
    { id: "event-save-the-date", name: "Save the date", category: "event", format: "instagram_post", accents: ["#be123c", "#fecdd3"], tags: ["date", "conference"] },
    SQ,
    { type: "color", color: "#fff1f2" },
    (k) => {
      k.rect({ x: 80, y: 80, w: 920, h: 920, fill: "#fff1f2", stroke: "#be123c", strokeWidth: 3, radius: 0 });
      k.text({ x: 80, y: 170, w: 920, text: "SAVE THE DATE", size: 34, weight: 700, color: "#be123c", align: "center", spacing: 12 });
      k.text({ x: 80, y: 260, w: 920, text: "18", size: 360, font: "Playfair Display", weight: 900, color: "#be123c", align: "center", lineHeight: 1 });
      k.text({ x: 80, y: 640, w: 920, text: "SEPTEMBER", size: 56, font: "Playfair Display", weight: 600, color: "#881337", align: "center", spacing: 10 });
      k.line({ x: 440, y: 750, w: 200, h: 3, stroke: "#be123c" });
      k.text({ x: 80, y: 800, w: 920, text: "Makers Summit 2026 · Lisbon", size: 36, color: "#881337", align: "center", font: "Raleway", weight: 600 });
    },
  ),
  template(
    { id: "event-yt-livestream", name: "Livestream thumbnail", category: "event", format: "youtube_thumbnail", accents: ["#ef4444", "#facc15"], tags: ["youtube", "live", "thumbnail"] },
    YT,
    { type: "gradient", gradient: linear(135, "#111827", "#1f2937") },
    (k) => {
      k.rect({ x: 60, y: 60, w: 210, h: 80, fill: "#ef4444", radius: 16 });
      k.text({ x: 60, y: 76, w: 210, text: "● LIVE", size: 44, font: "Archivo Black", color: "#ffffff", align: "center" });
      k.text({ x: 60, y: 200, w: 800, text: "Q&A:\nASK ME\nANYTHING", size: 130, font: "Anton", color: "#ffffff", lineHeight: 1 });
      k.star({ x: 860, y: 140, w: 360, h: 360, fill: "#facc15", points: 16, inner: 0.8, rotation: 12 });
      k.text({ x: 880, y: 260, w: 320, text: "SUNDAY\n7 PM", size: 56, font: "Archivo Black", color: "#111827", align: "center", lineHeight: 1.05 });
      k.text({ x: 60, y: 620, w: 900, text: "Bring your questions — we'll answer them all", size: 30, weight: 600, color: "#d1d5db" });
    },
  ),
];

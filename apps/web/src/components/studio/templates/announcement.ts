import { FB, PT, SQ, ST, linear, softShadow, template } from "./kit";

export const announcementTemplates = [
  template(
    { id: "ann-big-news", name: "Big news", category: "announcement", format: "instagram_post", accents: ["#ef4444", "#111827"], tags: ["news", "bold"] },
    SQ,
    { type: "color", color: "#ffffff" },
    (k) => {
      k.rect({ x: 0, y: 0, w: 1080, h: 540, fill: "#ef4444" });
      k.text({ x: 80, y: 120, w: 920, text: "BIG", size: 300, font: "Anton", color: "#ffffff", lineHeight: 1 });
      k.text({ x: 80, y: 560, w: 920, text: "NEWS", size: 300, font: "Anton", color: "#111827", lineHeight: 1 });
      k.icon({ x: 860, y: 100, w: 140, icon: "speakerphone", color: "#ffffff", strokeWidth: 1.6 });
      k.text({ x: 80, y: 900, w: 700, text: "We're moving to a bigger home.\nDetails in the caption.", size: 34, weight: 500, color: "#374151", lineHeight: 1.35 });
      k.text({ x: 760, y: 960, w: 240, text: "01 / 03", size: 28, weight: 700, color: "#9ca3af", align: "right" });
    },
  ),
  template(
    { id: "ann-were-open", name: "Now open", category: "announcement", format: "instagram_portrait", accents: ["#0d9488", "#fcd34d"], tags: ["opening", "store"] },
    PT,
    { type: "color", color: "#0d9488" },
    (k) => {
      k.ellipse({ x: 140, y: 140, w: 800, h: 800, fill: "#fcd34d", name: "Circle" });
      k.text({ x: 140, y: 330, w: 800, text: "NOW", size: 200, font: "Bebas Neue", color: "#134e4a", align: "center", lineHeight: 1 });
      k.text({ x: 140, y: 520, w: 800, text: "OPEN", size: 200, font: "Bebas Neue", color: "#134e4a", align: "center", lineHeight: 1 });
      k.text({ x: 80, y: 1010, w: 920, text: "Come say hi at our new space", size: 48, font: "Fraunces", weight: 600, color: "#ffffff", align: "center" });
      k.text({ x: 80, y: 1090, w: 920, text: "12 Harbour Lane · Mon–Sat, 9 am – 6 pm", size: 30, color: "#ccfbf1", align: "center" });
      k.icon({ x: 510, y: 1180, w: 60, icon: "map-pin", color: "#fcd34d" });
    },
  ),
  template(
    { id: "ann-story-update", name: "Product update story", category: "announcement", format: "instagram_story", accents: ["#8b5cf6", "#22d3ee"], tags: ["update", "app", "story"] },
    ST,
    { type: "gradient", gradient: linear(90, "#1e1b4b", "#312e81") },
    (k) => {
      k.text({
        x: 90,
        y: 220,
        w: 400,
        text: "NEW UPDATE",
        size: 30,
        weight: 700,
        color: "#ffffff",
        spacing: 4,
        pill: { color: "#8b5cf6", paddingX: 26, paddingY: 14, radius: 999 },
      });
      k.text({ x: 90, y: 340, w: 900, text: "Dark mode\nis finally\nhere.", size: 150, font: "Sora", weight: 800, color: "#ffffff", lineHeight: 1.02 });
      k.rect({ x: 190, y: 900, w: 700, h: 760, fill: "#0f172a", radius: 56, stroke: "#8b5cf6", strokeWidth: 4, shadow: softShadow(0.4, 60, 30) });
      k.rect({ x: 250, y: 980, w: 580, h: 60, fill: "#1e293b", radius: 30 });
      k.rect({ x: 250, y: 1080, w: 400, h: 40, fill: "#334155", radius: 20 });
      k.rect({ x: 250, y: 1150, w: 520, h: 40, fill: "#334155", radius: 20 });
      k.rect({ x: 250, y: 1260, w: 580, h: 300, fill: "#22d3ee", gradient: linear(30, "#8b5cf6", "#22d3ee"), radius: 28 });
      k.text({ x: 90, y: 1730, w: 900, text: "Update the app to try it", size: 38, weight: 600, color: "#c7d2fe", align: "center" });
    },
  ),
  template(
    { id: "ann-holiday-hours", name: "Holiday hours", category: "announcement", format: "facebook_post", accents: ["#dc2626", "#166534"], tags: ["hours", "holiday"] },
    FB,
    { type: "color", color: "#fef2f2" },
    (k) => {
      k.icon({ x: 80, y: 80, w: 70, icon: "snowflake", color: "#dc2626" });
      k.text({ x: 80, y: 180, w: 600, text: "Holiday\nhours", size: 96, font: "Playfair Display", weight: 800, color: "#7f1d1d", lineHeight: 1 });
      k.text({ x: 80, y: 420, w: 560, text: "We're taking a little break to be with family. See you in the new year!", size: 24, color: "#991b1b", lineHeight: 1.45 });
      k.rect({ x: 700, y: 70, w: 430, h: 490, fill: "#ffffff", radius: 28, shadow: softShadow(0.1, 30, 12) });
      k.text({
        x: 740,
        y: 120,
        w: 350,
        text: "Dec 24   Closed\nDec 25   Closed\nDec 26   10 – 4\nDec 31   10 – 2\nJan 1    Closed",
        size: 32,
        font: "JetBrains Mono",
        weight: 500,
        color: "#166534",
        lineHeight: 1.9,
      });
    },
  ),
];

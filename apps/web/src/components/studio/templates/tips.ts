import { PIN, PT, SQ, ST, linear, template } from "./kit";

export const tipsTemplates = [
  template(
    { id: "tips-numbered-five", name: "5 quick tips", category: "tips", format: "instagram_portrait", accents: ["#f59e0b", "#1e293b"], tags: ["listicle", "education"] },
    PT,
    { type: "color", color: "#fffbeb" },
    (k) => {
      k.text({ x: 80, y: 90, w: 900, text: "5 ways to", size: 56, font: "Poppins", weight: 500, color: "#1e293b" });
      k.text({ x: 80, y: 160, w: 920, text: "write captions\npeople finish", size: 92, font: "Poppins", weight: 800, color: "#1e293b", lineHeight: 1.05, spacing: -1 });
      const items = ["Lead with the payoff", "One idea per post", "Write like you talk", "Cut the first sentence", "End with a question"];
      items.forEach((t, i) => {
        const y = 440 + i * 160;
        k.ellipse({ x: 80, y, w: 110, h: 110, fill: "#f59e0b" });
        k.text({ x: 80, y: y + 22, w: 110, text: String(i + 1), size: 54, font: "Archivo Black", color: "#1e293b", align: "center", lineHeight: 1.2 });
        k.text({ x: 230, y: y + 28, w: 760, text: t, size: 44, weight: 600, color: "#1e293b", font: "Manrope" });
      });
      k.text({ x: 80, y: 1260, w: 920, text: "Save for later  ·  @yourbrand", size: 26, weight: 600, color: "#b45309", align: "right" });
    },
  ),
  template(
    { id: "tips-checklist", name: "Checklist card", category: "tips", format: "instagram_post", accents: ["#10b981", "#064e3b"], tags: ["checklist", "how-to"] },
    SQ,
    { type: "gradient", gradient: linear(160, "#064e3b", "#065f46") },
    (k) => {
      k.text({ x: 90, y: 90, w: 900, text: "LAUNCH CHECKLIST", size: 28, weight: 700, color: "#6ee7b7", spacing: 6 });
      k.text({ x: 90, y: 140, w: 900, text: "Before you hit publish", size: 70, font: "Space Grotesk", weight: 700, color: "#ffffff" });
      k.rect({ x: 90, y: 280, w: 900, h: 700, fill: "#ffffff", radius: 36 });
      const items = ["Proofread twice, out loud", "Add alt text to images", "Check every link", "Schedule at peak hours", "Reply to the first comments"];
      items.forEach((t, i) => {
        const y = 340 + i * 124;
        k.rect({ x: 150, y, w: 72, h: 72, fill: "#10b981", radius: 18 });
        k.icon({ x: 162, y: y + 12, w: 48, icon: "check", color: "#ffffff", strokeWidth: 3 });
        k.text({ x: 260, y: y + 14, w: 680, text: t, size: 38, weight: 600, color: "#064e3b", font: "Inter" });
      });
    },
  ),
  template(
    { id: "tips-story-myth-fact", name: "Myth vs fact story", category: "tips", format: "instagram_story", accents: ["#f43f5e", "#22c55e"], tags: ["myth", "fact", "education", "story"] },
    ST,
    { type: "color", color: "#f8fafc" },
    (k) => {
      k.text({ x: 90, y: 160, w: 900, text: "Let's clear\nthis up.", size: 120, font: "Outfit", weight: 800, color: "#0f172a", lineHeight: 1.02 });
      k.rect({ x: 90, y: 520, w: 900, h: 560, fill: "#f43f5e", radius: 48 });
      k.text({ x: 150, y: 580, w: 300, text: "MYTH", size: 34, weight: 800, color: "#f43f5e", spacing: 6, pill: { color: "#ffffff", paddingX: 24, paddingY: 12, radius: 999 } });
      k.text({ x: 150, y: 700, w: 780, text: "You need to post\nevery single day.", size: 72, font: "Outfit", weight: 700, color: "#ffffff", lineHeight: 1.1 });
      k.icon({ x: 820, y: 940, w: 100, icon: "x", color: "#ffffff", strokeWidth: 2.5 });
      k.rect({ x: 90, y: 1140, w: 900, h: 560, fill: "#22c55e", radius: 48 });
      k.text({ x: 150, y: 1200, w: 300, text: "FACT", size: 34, weight: 800, color: "#16a34a", spacing: 6, pill: { color: "#ffffff", paddingX: 24, paddingY: 12, radius: 999 } });
      k.text({ x: 150, y: 1320, w: 780, text: "Consistency beats\nvolume. Pick a\npace you can keep.", size: 64, font: "Outfit", weight: 700, color: "#ffffff", lineHeight: 1.12 });
      k.icon({ x: 820, y: 1560, w: 100, icon: "check", color: "#ffffff", strokeWidth: 2.5 });
    },
  ),
  template(
    { id: "tips-pin-guide", name: "Step-by-step pin", category: "tips", format: "pinterest_pin", accents: ["#7c3aed", "#ede9fe"], tags: ["guide", "pinterest", "steps"] },
    PIN,
    { type: "color", color: "#ede9fe" },
    (k) => {
      k.rect({ x: 0, y: 0, w: 1000, h: 460, fill: "#7c3aed" });
      k.text({ x: 70, y: 90, w: 860, text: "THE 3-STEP GUIDE TO", size: 30, weight: 700, color: "#ddd6fe", spacing: 5 });
      k.text({ x: 70, y: 150, w: 860, text: "A calmer\nmorning routine", size: 96, font: "Fraunces", weight: 700, color: "#ffffff", lineHeight: 1.02 });
      const steps = [
        ["sun", "Wake with light", "Open the curtains before your phone."],
        ["coffee", "Slow first sip", "Five quiet minutes, no screens."],
        ["pencil", "Write one line", "Today will be good because…"],
      ] as const;
      steps.forEach(([icon, title, body], i) => {
        const y = 540 + i * 290;
        k.rect({ x: 70, y, w: 860, h: 250, fill: "#ffffff", radius: 32 });
        k.ellipse({ x: 110, y: y + 55, w: 140, h: 140, fill: "#7c3aed" });
        k.icon({ x: 145, y: y + 90, w: 70, icon, color: "#ffffff" });
        k.text({ x: 290, y: y + 65, w: 600, text: title, size: 44, font: "Fraunces", weight: 700, color: "#2e1065" });
        k.text({ x: 290, y: y + 130, w: 600, text: body, size: 28, color: "#6d28d9" });
      });
      k.text({ x: 70, y: 1420, w: 860, text: "yourbrand.com/blog", size: 26, weight: 600, color: "#7c3aed", align: "center" });
    },
  ),
];

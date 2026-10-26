import { LI, PT, SQ, ST, linear, template } from "./kit";

export const quoteTemplates = [
  template(
    { id: "quote-serif-cream", name: "Serif quote on cream", category: "quote", format: "instagram_post", accents: ["#b45309", "#78350f"], tags: ["quote", "minimal", "serif"] },
    SQ,
    { type: "color", color: "#fbf7f0" },
    (k) => {
      k.text({ x: 90, y: 120, w: 300, text: "“", size: 300, font: "DM Serif Display", color: "#b45309", lineHeight: 1 });
      k.text({
        x: 120,
        y: 380,
        w: 840,
        text: "Simplicity is not the absence\nof clutter — it's the presence\nof what matters.",
        size: 64,
        font: "DM Serif Display",
        color: "#1c1917",
        lineHeight: 1.18,
      });
      k.line({ x: 120, y: 700, w: 90, h: 4, stroke: "#b45309" });
      k.text({ x: 120, y: 740, w: 700, text: "MAYA OKAFOR", size: 28, weight: 700, color: "#78350f", spacing: 5 });
      k.text({ x: 120, y: 785, w: 700, text: "Founder & designer", size: 26, color: "#78716c" });
      k.text({ x: 120, y: 950, w: 840, text: "@yourbrand", size: 24, weight: 600, color: "#a8a29e", align: "right" });
    },
  ),
  template(
    { id: "quote-bold-gradient", name: "Bold gradient quote", category: "quote", format: "instagram_portrait", accents: ["#0ea5e9", "#6366f1", "#f472b6"], tags: ["quote", "gradient", "motivation"] },
    PT,
    { type: "gradient", gradient: linear(150, "#0ea5e9", "#6366f1", "#f472b6") },
    (k) => {
      k.rect({ x: 80, y: 80, w: 920, h: 1190, fill: "#ffffff", opacity: 0.12, radius: 48, stroke: "#ffffff", strokeWidth: 2 });
      k.icon({ x: 140, y: 160, w: 120, icon: "quote", color: "#ffffff", strokeWidth: 1.5 });
      k.text({
        x: 140,
        y: 380,
        w: 800,
        text: "Small steps,\ntaken daily,\nbuild big things.",
        size: 112,
        font: "Poppins",
        weight: 800,
        color: "#ffffff",
        lineHeight: 1.05,
        spacing: -2,
      });
      k.text({ x: 140, y: 1000, w: 800, text: "— Notes to self, vol. 12", size: 34, weight: 500, color: "#e0f2fe" });
      k.text({ x: 140, y: 1150, w: 800, text: "SAVE THIS FOR MONDAY", size: 24, weight: 700, color: "#ffffff", spacing: 6 });
    },
  ),
  template(
    { id: "quote-story-dark", name: "Midnight story quote", category: "quote", format: "instagram_story", accents: ["#facc15"], tags: ["quote", "dark", "story"] },
    ST,
    { type: "color", color: "#111111" },
    (k) => {
      k.ellipse({ x: 340, y: 340, w: 400, h: 400, fill: "#facc15", name: "Sun" });
      k.text({ x: 90, y: 860, w: 900, text: "Make it work.\nThen make it\nbeautiful.", size: 120, font: "Playfair Display", weight: 700, color: "#ffffff", align: "center", lineHeight: 1.08 });
      k.text({ x: 90, y: 1340, w: 900, text: "A reminder from the studio", size: 36, italic: true, font: "Playfair Display", color: "#a3a3a3", align: "center" });
      k.line({ x: 490, y: 1480, w: 100, h: 4, stroke: "#facc15" });
      k.text({ x: 90, y: 1700, w: 900, text: "@yourbrand", size: 32, weight: 600, color: "#facc15", align: "center", spacing: 2 });
    },
  ),
  template(
    { id: "quote-linkedin-insight", name: "Leadership insight", category: "quote", format: "linkedin_post", accents: ["#2563eb", "#dbeafe"], tags: ["quote", "linkedin", "business"] },
    LI,
    { type: "color", color: "#ffffff" },
    (k) => {
      k.rect({ x: 0, y: 0, w: 24, h: 627, fill: "#2563eb" });
      k.rect({ x: 840, y: 0, w: 360, h: 627, fill: "#dbeafe" });
      k.icon({ x: 930, y: 190, w: 180, icon: "bulb", color: "#2563eb", strokeWidth: 1.4 });
      k.text({ x: 90, y: 90, w: 700, text: "INSIGHT OF THE WEEK", size: 22, weight: 700, color: "#2563eb", spacing: 5 });
      k.text({
        x: 90,
        y: 150,
        w: 700,
        text: "The best teams don't avoid\nhard conversations — they\nschedule them.",
        size: 46,
        font: "Manrope",
        weight: 800,
        color: "#0f172a",
        lineHeight: 1.2,
      });
      k.text({ x: 90, y: 440, w: 700, text: "Jordan Lee", size: 26, weight: 700, color: "#0f172a" });
      k.text({ x: 90, y: 478, w: 700, text: "VP People, Northwind", size: 22, color: "#64748b" });
    },
  ),
];

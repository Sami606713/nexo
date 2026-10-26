import { FB, PT, SQ, ST, softShadow, template } from "./kit";

const stars = (k: Parameters<Parameters<typeof template>[3]>[0], x: number, y: number, size: number, color: string, gap = 12) => {
  for (let i = 0; i < 5; i++) k.star({ x: x + i * (size + gap), y, w: size, h: size, fill: color, points: 5, inner: 0.45 });
};

export const testimonialTemplates = [
  template(
    { id: "testi-five-star", name: "Five-star review", category: "testimonial", format: "instagram_post", accents: ["#f59e0b", "#1e3a8a"], tags: ["review", "customer"] },
    SQ,
    { type: "color", color: "#eff6ff" },
    (k) => {
      k.rect({ x: 90, y: 150, w: 900, h: 780, fill: "#ffffff", radius: 40, shadow: softShadow(0.1, 50, 20) });
      stars(k, 170, 230, 64, "#f59e0b");
      k.text({
        x: 170,
        y: 350,
        w: 740,
        text: "“Setup took five minutes and\nour team saved hours in the\nfirst week. Genuinely delightful.”",
        size: 46,
        font: "Lora",
        weight: 500,
        color: "#1e293b",
        lineHeight: 1.35,
      });
      k.ellipse({ x: 170, y: 710, w: 120, h: 120, fill: "#1e3a8a" });
      k.text({ x: 170, y: 745, w: 120, text: "PS", size: 44, weight: 800, color: "#ffffff", align: "center" });
      k.text({ x: 320, y: 728, w: 560, text: "Priya Shah", size: 36, weight: 700, color: "#0f172a" });
      k.text({ x: 320, y: 778, w: 560, text: "Marketing lead, Oakfield Co.", size: 28, color: "#64748b" });
    },
  ),
  template(
    { id: "testi-big-quote-portrait", name: "Customer love", category: "testimonial", format: "instagram_portrait", accents: ["#db2777", "#fce7f3"], tags: ["review", "love"] },
    PT,
    { type: "color", color: "#fce7f3" },
    (k) => {
      k.icon({ x: 80, y: 90, w: 100, icon: "heart", color: "#db2777", strokeWidth: 2 });
      k.text({ x: 80, y: 220, w: 920, text: "WHAT OUR CUSTOMERS SAY", size: 30, weight: 700, color: "#db2777", spacing: 6 });
      k.text({
        x: 80,
        y: 300,
        w: 920,
        text: "“I've tried every\nskincare brand out\nthere. This is the one\nI keep coming back to.”",
        size: 84,
        font: "DM Serif Display",
        color: "#500724",
        lineHeight: 1.12,
      });
      k.line({ x: 80, y: 1000, w: 140, h: 6, stroke: "#db2777" });
      k.text({ x: 80, y: 1050, w: 700, text: "Elena M., verified buyer", size: 38, weight: 600, color: "#831843" });
      stars(k, 80, 1130, 44, "#db2777", 10);
    },
  ),
  template(
    { id: "testi-story-chat", name: "Message screenshot story", category: "testimonial", format: "instagram_story", accents: ["#3b82f6", "#e0e7ff"], tags: ["review", "chat", "story"] },
    ST,
    { type: "color", color: "#e0e7ff" },
    (k) => {
      k.text({ x: 90, y: 200, w: 900, text: "This made\nour week ✦", size: 130, font: "Outfit", weight: 800, color: "#1e3a8a", lineHeight: 1.02 });
      k.rect({ x: 90, y: 620, w: 760, h: 300, fill: "#ffffff", radius: 48, shadow: softShadow(0.1, 30, 12) });
      k.text({ x: 140, y: 670, w: 660, text: "Just got my order and\nthe packaging alone made\nme smile. Thank you!!", size: 44, color: "#1e293b", lineHeight: 1.3 });
      k.rect({ x: 230, y: 980, w: 760, h: 220, fill: "#3b82f6", radius: 48, shadow: softShadow(0.15, 30, 12) });
      k.text({ x: 280, y: 1030, w: 660, text: "That means the world to\nus — enjoy every bit 💙", size: 44, color: "#ffffff", lineHeight: 1.3 });
      k.rect({ x: 90, y: 1260, w: 560, h: 160, fill: "#ffffff", radius: 48, shadow: softShadow(0.1, 30, 12) });
      k.text({ x: 140, y: 1310, w: 460, text: "Already ordering again 🙌", size: 44, color: "#1e293b" });
      k.text({ x: 90, y: 1700, w: 900, text: "Share yours with #yourbrand", size: 40, weight: 700, color: "#1e3a8a", align: "center" });
    },
  ),
  template(
    { id: "testi-case-study", name: "Case study result", category: "testimonial", format: "facebook_post", accents: ["#059669", "#d1fae5"], tags: ["results", "b2b", "stats"] },
    FB,
    { type: "color", color: "#ffffff" },
    (k) => {
      k.rect({ x: 0, y: 0, w: 480, h: 630, fill: "#059669" });
      k.text({ x: 50, y: 150, w: 380, text: "3.4×", size: 180, font: "Space Grotesk", weight: 700, color: "#ffffff", align: "center", lineHeight: 1 });
      k.text({ x: 50, y: 360, w: 380, text: "more qualified leads\nin 90 days", size: 34, weight: 600, color: "#d1fae5", align: "center", lineHeight: 1.3 });
      k.text({ x: 540, y: 110, w: 600, text: "CUSTOMER STORY", size: 22, weight: 700, color: "#059669", spacing: 5 });
      k.text({ x: 540, y: 160, w: 600, text: "“We finally have a\nsystem that scales with\nus, not against us.”", size: 44, font: "Lora", weight: 600, color: "#0f172a", lineHeight: 1.25 });
      k.text({ x: 540, y: 400, w: 600, text: "Tom Becker, COO at Fieldstone", size: 26, weight: 600, color: "#334155" });
      k.text({ x: 540, y: 470, w: 300, text: "Read the story", size: 24, weight: 700, color: "#059669", pill: { color: "#d1fae5", paddingX: 24, paddingY: 14, radius: 999 } });
    },
  ),
];

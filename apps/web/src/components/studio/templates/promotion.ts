import { FB, PT, SQ, ST, XP, linear, radial, softShadow, template } from "./kit";

export const promotionTemplates = [
  template(
    { id: "promo-flash-burst", name: "Flash sale burst", category: "promotion", format: "instagram_post", accents: ["#4f46e5", "#facc15", "#7c3aed"], tags: ["sale", "discount", "bold"] },
    SQ,
    { type: "gradient", gradient: linear(135, "#4f46e5", "#7c3aed") },
    (k) => {
      k.ellipse({ x: 640, y: -160, w: 600, h: 600, fill: "#ffffff", opacity: 0.08, name: "Glow" });
      k.ellipse({ x: -200, y: 760, w: 520, h: 520, fill: "#ffffff", opacity: 0.06, name: "Glow" });
      k.text({ x: 90, y: 110, w: 900, text: "LIMITED TIME ONLY", size: 30, weight: 700, color: "#e0e7ff", spacing: 8, align: "center" });
      k.text({ x: 60, y: 170, w: 960, text: "FLASH SALE", size: 170, font: "Anton", color: "#ffffff", align: "center", lineHeight: 1.05 });
      k.star({ x: 300, y: 390, w: 480, h: 480, fill: "#facc15", points: 14, inner: 0.82, rotation: 0, name: "Burst", shadow: softShadow(0.25, 50, 20) });
      k.text({ x: 340, y: 500, w: 400, text: "50%", size: 170, font: "Anton", color: "#1e1b4b", align: "center", lineHeight: 1 });
      k.text({ x: 340, y: 680, w: 400, text: "OFF EVERYTHING", size: 34, weight: 800, font: "Montserrat", color: "#1e1b4b", align: "center", spacing: 2 });
      k.text({
        x: 290,
        y: 930,
        w: 500,
        text: "Code FLASH50 · Ends Sunday",
        size: 30,
        weight: 600,
        font: "Montserrat",
        color: "#1e1b4b",
        align: "center",
        pill: { color: "#ffffff", paddingX: 28, paddingY: 16, radius: 40 },
      });
    },
  ),
  template(
    { id: "promo-minimal-edit", name: "Minimal seasonal edit", category: "promotion", format: "instagram_portrait", accents: ["#e8674a", "#1f2937"], tags: ["sale", "minimal", "fashion"] },
    PT,
    { type: "color", color: "#f6f1ea" },
    (k) => {
      k.rect({ x: 80, y: 80, w: 920, h: 760, fill: "#e8674a", radius: 32, name: "Feature block" });
      k.ellipse({ x: 600, y: 200, w: 320, h: 320, fill: "#f6f1ea", opacity: 0.18 });
      k.text({ x: 140, y: 150, w: 600, text: "THE SUMMER EDIT", size: 30, weight: 600, color: "#fff7ed", spacing: 6 });
      k.text({ x: 130, y: 400, w: 820, text: "-30%", size: 300, font: "Fraunces", weight: 800, color: "#fff7ed", lineHeight: 1 });
      k.text({ x: 140, y: 720, w: 700, text: "on linen, knits and everything sunny", size: 36, color: "#fff7ed", font: "Work Sans" });
      k.text({ x: 80, y: 920, w: 920, text: "Fresh pieces, fair prices.\nNo code needed.", size: 58, font: "Fraunces", weight: 600, color: "#1f2937", lineHeight: 1.15 });
      k.text({
        x: 80,
        y: 1150,
        w: 360,
        text: "Shop the edit  →",
        size: 32,
        weight: 600,
        color: "#ffffff",
        font: "Work Sans",
        pill: { color: "#1f2937", paddingX: 34, paddingY: 20, radius: 999 },
      });
      k.text({ x: 640, y: 1170, w: 360, text: "yourbrand.com", size: 28, color: "#6b7280", align: "right" });
    },
  ),
  template(
    { id: "promo-story-big-sale", name: "Big sale story", category: "promotion", format: "instagram_story", accents: ["#ec4899", "#f97316", "#fde047"], tags: ["sale", "story", "gradient"] },
    ST,
    { type: "gradient", gradient: linear(120, "#ec4899", "#f97316") },
    (k) => {
      k.ellipse({ x: -180, y: -120, w: 700, h: 700, fill: "#fde047", opacity: 0.35 });
      k.ellipse({ x: 640, y: 1460, w: 620, h: 620, fill: "#ffffff", opacity: 0.12 });
      k.text({ x: 90, y: 300, w: 900, text: "THIS WEEKEND", size: 40, weight: 800, color: "#ffffff", spacing: 10, align: "center" });
      k.text({ x: 60, y: 400, w: 960, text: "BIG\nSALE", size: 380, font: "Bebas Neue", color: "#ffffff", align: "center", lineHeight: 0.88, shadow: softShadow(0.2, 30, 12) });
      k.rect({ x: 190, y: 1130, w: 700, h: 200, fill: "#ffffff", radius: 100, shadow: softShadow(0.2, 40, 18) });
      k.text({ x: 190, y: 1175, w: 700, text: "UP TO 70% OFF", size: 92, font: "Bebas Neue", color: "#ec4899", align: "center", lineHeight: 1.1 });
      k.icon({ x: 500, y: 1560, w: 80, icon: "chevron-right", color: "#ffffff", rotation: -90, strokeWidth: 2.5 });
      k.text({ x: 190, y: 1600, w: 700, text: "Swipe up to shop", size: 40, weight: 700, color: "#ffffff", align: "center" });
    },
  ),
  template(
    { id: "promo-two-for-one", name: "Two-for-one deal", category: "promotion", format: "x_post", accents: ["#22d3ee", "#a3e635"], tags: ["deal", "dark", "food"] },
    XP,
    { type: "color", color: "#0f172a" },
    (k) => {
      k.ellipse({ x: 920, y: 110, w: 680, h: 680, gradient: linear(45, "#22d3ee", "#a3e635"), fill: "#22d3ee", name: "Badge" });
      k.text({ x: 920, y: 300, w: 680, text: "2 for 1", size: 190, font: "Archivo Black", color: "#0f172a", align: "center", lineHeight: 1 });
      k.text({ x: 920, y: 510, w: 680, text: "EVERY FRIDAY", size: 40, weight: 800, color: "#0f172a", align: "center", spacing: 6 });
      k.text({ x: 110, y: 170, w: 760, text: "WEEKEND DEAL", size: 32, weight: 700, color: "#22d3ee", spacing: 8 });
      k.text({ x: 110, y: 240, w: 780, text: "Bring a friend.\nPay for one.", size: 104, font: "Space Grotesk", weight: 700, color: "#ffffff", lineHeight: 1.05 });
      k.text({ x: 110, y: 510, w: 700, text: "Valid on all mains, dine-in or takeaway.\nNo booking required.", size: 34, color: "#94a3b8", lineHeight: 1.45 });
      k.line({ x: 110, y: 680, w: 120, h: 6, stroke: "#a3e635" });
      k.text({ x: 110, y: 720, w: 700, text: "@yourbrand", size: 32, weight: 600, color: "#e2e8f0" });
    },
  ),
  template(
    { id: "promo-free-shipping", name: "Free shipping banner", category: "promotion", format: "facebook_post", accents: ["#16a34a", "#bbf7d0"], tags: ["shipping", "ecommerce"] },
    FB,
    { type: "gradient", gradient: radial("#f0fdf4", "#dcfce7") },
    (k) => {
      k.rect({ x: 700, y: 70, w: 430, h: 490, fill: "#16a34a", radius: 40, shadow: softShadow(0.15, 40, 18) });
      k.icon({ x: 795, y: 150, w: 240, icon: "truck-delivery", color: "#ffffff", strokeWidth: 1.5 });
      k.text({ x: 720, y: 420, w: 390, text: "ORDERS $50+", size: 40, font: "Bebas Neue", color: "#bbf7d0", align: "center", spacing: 4 });
      k.text({ x: 80, y: 120, w: 580, text: "Free shipping,\nall month long.", size: 72, font: "Poppins", weight: 800, color: "#052e16", lineHeight: 1.08 });
      k.text({ x: 80, y: 310, w: 560, text: "Treat yourself — delivery is on us for every order over $50 until the 31st.", size: 26, color: "#166534", lineHeight: 1.45 });
      k.text({
        x: 80,
        y: 450,
        w: 260,
        text: "Start shopping",
        size: 26,
        weight: 700,
        color: "#ffffff",
        align: "center",
        pill: { color: "#16a34a", paddingX: 28, paddingY: 16, radius: 999 },
      });
    },
  ),
];

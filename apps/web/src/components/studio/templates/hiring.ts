import { LI, PT, SQ, ST, linear, template } from "./kit";

export const hiringTemplates = [
  template(
    { id: "hire-were-hiring", name: "We're hiring", category: "hiring", format: "instagram_post", accents: ["#2563eb", "#facc15"], tags: ["jobs", "careers"] },
    SQ,
    { type: "color", color: "#2563eb" },
    (k) => {
      k.text({ x: 80, y: 110, w: 920, text: "WE'RE", size: 220, font: "Anton", color: "#ffffff", lineHeight: 1 });
      k.text({ x: 80, y: 330, w: 920, text: "HIRING", size: 220, font: "Anton", color: "#facc15", lineHeight: 1 });
      k.rect({ x: 80, y: 620, w: 920, h: 300, fill: "#1d4ed8", radius: 28 });
      k.text({ x: 130, y: 670, w: 820, text: "Senior Product Designer\nBackend Engineer (Go)\nCustomer Success Lead", size: 44, weight: 600, color: "#ffffff", lineHeight: 1.45, font: "Inter" });
      k.text({ x: 80, y: 960, w: 920, text: "Remote-friendly · Apply via link in bio", size: 30, weight: 600, color: "#bfdbfe" });
    },
  ),
  template(
    { id: "hire-join-team-portrait", name: "Join the team", category: "hiring", format: "instagram_portrait", accents: ["#14b8a6", "#0f172a"], tags: ["jobs", "team", "culture"] },
    PT,
    { type: "color", color: "#f0fdfa" },
    (k) => {
      k.icon({ x: 80, y: 90, w: 100, icon: "users", color: "#14b8a6" });
      k.text({ x: 80, y: 230, w: 920, text: "Join a team that\nships and cares.", size: 96, font: "Manrope", weight: 800, color: "#0f172a", lineHeight: 1.05 });
      k.text({
        x: 80,
        y: 490,
        w: 460,
        text: "NOW HIRING",
        size: 30,
        weight: 800,
        color: "#ffffff",
        spacing: 5,
        pill: { color: "#14b8a6", paddingX: 26, paddingY: 14, radius: 999 },
      });
      const perks = [
        ["home", "Work from anywhere"],
        ["plant", "4-day summer weeks"],
        ["school", "$2k learning budget"],
        ["heart", "Full health cover"],
      ] as const;
      perks.forEach(([icon, t], i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 80 + col * 470;
        const y = 640 + row * 250;
        k.rect({ x, y, w: 450, h: 220, fill: "#ffffff", radius: 28, stroke: "#99f6e4", strokeWidth: 2 });
        k.icon({ x: x + 40, y: y + 36, w: 64, icon, color: "#14b8a6" });
        k.text({ x: x + 40, y: y + 124, w: 380, text: t, size: 34, weight: 700, color: "#0f172a" });
      });
      k.text({ x: 80, y: 1190, w: 920, text: "yourbrand.com/careers", size: 32, weight: 600, color: "#0d9488" });
    },
  ),
  template(
    { id: "hire-story-role", name: "Open role story", category: "hiring", format: "instagram_story", accents: ["#f97316", "#1c1917"], tags: ["job", "role", "story"] },
    ST,
    { type: "color", color: "#1c1917" },
    (k) => {
      k.rect({ x: 90, y: 200, w: 900, h: 8, fill: "#f97316" });
      k.text({ x: 90, y: 260, w: 900, text: "OPEN ROLE", size: 36, weight: 700, color: "#f97316", spacing: 8 });
      k.text({ x: 90, y: 340, w: 900, text: "Social\nMedia\nManager", size: 190, font: "Bebas Neue", color: "#fafaf9", lineHeight: 0.92 });
      const facts = ["Full-time · Berlin or remote (EU)", "€55–65k + equity", "Start: as soon as you're ready"];
      facts.forEach((t, i) => {
        k.icon({ x: 90, y: 980 + i * 110, w: 52, icon: "arrow-right", color: "#f97316", strokeWidth: 2.2 });
        k.text({ x: 170, y: 986 + i * 110, w: 820, text: t, size: 40, weight: 500, color: "#e7e5e4" });
      });
      k.rect({ x: 90, y: 1460, w: 900, h: 200, fill: "#f97316", radius: 32 });
      k.text({ x: 90, y: 1520, w: 900, text: "Tap the link to apply", size: 56, font: "Bebas Neue", color: "#1c1917", align: "center", spacing: 2 });
    },
  ),
  template(
    { id: "hire-linkedin-banner", name: "LinkedIn hiring banner", category: "hiring", format: "linkedin_post", accents: ["#4f46e5", "#a5b4fc"], tags: ["linkedin", "jobs"] },
    LI,
    { type: "gradient", gradient: linear(0, "#eef2ff", "#ffffff") },
    (k) => {
      k.ellipse({ x: 850, y: 120, w: 380, h: 380, fill: "#a5b4fc", opacity: 0.5 });
      k.ellipse({ x: 900, y: 170, w: 280, h: 280, fill: "#4f46e5" });
      k.icon({ x: 975, y: 245, w: 130, icon: "briefcase", color: "#ffffff", strokeWidth: 1.5 });
      k.text({ x: 80, y: 110, w: 700, text: "#Hiring", size: 26, weight: 700, color: "#4f46e5" });
      k.text({ x: 80, y: 160, w: 720, text: "We're looking for a\nHead of Growth", size: 64, font: "Poppins", weight: 700, color: "#1e1b4b", lineHeight: 1.12 });
      k.text({ x: 80, y: 340, w: 680, text: "Help 10,000 small businesses tell their story. Remote, full-time.", size: 26, color: "#475569", lineHeight: 1.4 });
      k.text({ x: 80, y: 460, w: 260, text: "Apply now", size: 26, weight: 700, color: "#ffffff", pill: { color: "#4f46e5", paddingX: 30, paddingY: 16, radius: 999 } });
    },
  ),
];

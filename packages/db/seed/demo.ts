/**
 * Demo dataset for the product video: brand "Northwind Coffee Co." owned by test@example.com.
 * Idempotent: deletes the brand (cascade) + seeded rows and recreates everything.
 *
 *   npm run seed:demo        (= npx tsx --env-file=.env packages/db/seed/demo.ts)
 *
 * All seeded channels carry extras.demo = true and empty encrypted credentials; the worker simulates
 * publishing to demo channels, and the metrics worker skips them.
 */
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { Prisma, prisma, type Network, type PostStatus, type Role } from "@postline/db";
import { encryptCredentials } from "@postline/core/crypto";
import { PLAN_LIMITS } from "@postline/core";

const BRAND_NAME = "Northwind Coffee Co.";
const OWNER_EMAIL = "test@example.com";
const PASSWORD = "password123";
const TZ = "America/New_York";
const BIO_SLUG = "northwind";
const DAY = 24 * 3600_000;
/** Absolute base for brand logos (the brand form/schema require http(s) URLs). */
const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DEMO = join(HERE, "../../../apps/web/public/demo");

// ───────────────────────── deterministic randomness ─────────────────────────
let seed = 20261026;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + (b - a) * rand();
const int = (a: number, b: number) => Math.floor(between(a, b + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
function sample<T>(xs: readonly T[], n: number): T[] {
  const copy = [...xs];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]!);
  return out;
}
const json = (v: unknown) => v as Prisma.InputJsonValue;

// ───────────────────────── time zone helpers ─────────────────────────
function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
  return asUtc - at.getTime();
}
/** Date for local brand time: `dayOffset` days from today (local), at hh:mm. */
function localAt(dayOffset: number, hour: number, minute = 0): Date {
  const now = new Date();
  const off = tzOffsetMs(now, TZ);
  const local = new Date(now.getTime() + off);
  const guess = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset, hour, minute);
  return new Date(guess - tzOffsetMs(new Date(guess), TZ));
}
function localWeekday(d: Date): number {
  return new Date(d.getTime() + tzOffsetMs(d, TZ)).getUTCDay();
}
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// ───────────────────────── content ─────────────────────────
const CAPTIONS: string[] = [
  "Rainy Monday? Our Ethiopia Guji is doing the heavy lifting today — bright, floral, a little bit of blueberry. Pour-over bar opens at 7.",
  "We roast every Tuesday and Friday. If you've ever wondered why your bag says \"roasted on\" instead of \"best by\" — freshness is a flavor, and it fades fast.",
  "Meet Rosa, our head roaster. 11 years, 4 continents, and still tastes every single batch before it leaves the building.",
  "New on the menu: the Maple Cortado. Equal parts espresso and steamed oat milk, with a whisper of Vermont maple. Not too sweet. Just right.",
  "Pro tip for home brewers: weigh your coffee. A $20 kitchen scale will improve your cup more than a $200 grinder upgrade.",
  "Saturday latte art throwdown is BACK. Sign-ups at the counter, winner gets a month of free drinks and eternal bragging rights.",
  "Cold brew season never really ended for some of you, and we respect that. 18-hour steep, served over big clear ice.",
  "Where does your coffee come from? This month: Finca El Mirador in Huila, Colombia — a family farm we've bought from for six harvests running.",
  "Our compostable cups are now officially compostable in the city program. Toss them in the green bin — no guilt, just coffee.",
  "Behind the counter at 6:42am: three grinders warming up, one playlist debate, zero chill until the first espresso shot dials in.",
  "Pastry drop: cardamom morning buns from our friends at Little Oven Bakery. They sold out by 10 last week. Consider yourself warned.",
  "Is decaf \"real\" coffee? Our Swiss Water Process Peru says yes. Chocolatey, nutty, and you'll still sleep tonight.",
  "Thank you for 10,000 cups served through our refill program this year. That's 10,000 fewer paper cups in a landfill. You did that.",
  "Espresso 101 workshop this Thursday, 6pm. Learn to pull a shot, steam milk and taste the difference between under- and over-extraction. 8 seats left.",
  "Flat white vs. latte: the difference is milk texture and ratio. Flat white = thinner microfoam, stronger coffee flavor. Fight us in the comments.",
  "The new Northwind House Blend bag design is here — same beans you love, now in a resealable pouch that actually keeps them fresh.",
  "Today's soundtrack at the Harbor St. location is entirely 70s soul. Requests accepted, judgement withheld.",
  "Single-origin spotlight: Kenya Nyeri AA. Think blackcurrant, grapefruit and a juicy finish. Available as pour-over all week.",
  "We're hiring baristas for our new Elm Park shop! Coffee experience is nice; kindness is required. Link in bio.",
  "Ask a barista: \"Why does my coffee taste bitter at home?\" Usually it's too fine a grind or water that's too hot. Try 93°C and a slightly coarser setting.",
  "Our subscription now ships every 2, 3 or 4 weeks. Skip, pause or swap origins any time — no phone calls, no guilt trips.",
  "Dog-friendly patio is open! Water bowls are out, and yes, the pup cups are free.",
  "Small batch alert: only 40 bags of our Panama Geisha this season. Jasmine, peach, honey. Online at 10am Friday.",
  "Here's what a cupping table looks like at 8am on a Wednesday. Slurping is mandatory. Spitting is encouraged.",
  "The oat milk vs. whole milk debate is settled: get whatever makes you happy. We'll steam it perfectly either way.",
  "Fun fact: a coffee cherry takes about 9 months to ripen. Every cup you drink is the end of a very long journey.",
  "Community night this Friday — local musicians, half-price drip, and our first ever coffee-and-cookie pairing flight.",
  "We switched our delivery van to electric. Same Tuesday drop-offs to our wholesale partners, way quieter mornings for the neighborhood.",
  "Brewing guide: AeroPress, inverted method. 15g coffee, 230g water at 90°C, steep 1:30, flip, press 30 seconds. Clean, sweet, easy.",
  "Your weekend order, by the numbers: 1 oat cortado, 2 cardamom buns, 0 regrets.",
  "The secret to our chai? We make the concentrate in-house every morning — black tea, ginger, cinnamon, clove and a lot of patience.",
  "Rosa's tasting notes for this week's roast: milk chocolate, toasted almond, a hint of orange peel. Perfect for espresso or a big batch drip.",
  "We just passed our 5th birthday. Five years of early alarms, burnt fingers and the best regulars anyone could ask for. Thank you.",
  "Holiday blend pre-orders open next week. Hint: there's cocoa nib involved.",
  "Why we pay above Fair Trade minimums: great coffee needs farmers who can afford to keep growing great coffee. Simple as that.",
  "Morning ritual check: what's in your mug right now? Drop a photo below — best one gets a free bag next week.",
  "Sneak peek of the Elm Park build-out. Reclaimed oak counters, a lot more seating, and a window bar for people-watching.",
  "Iced shaken espresso with brown sugar and cinnamon. It's a whole mood and it's available all day.",
  "Coffee storage myth: don't put beans in the fridge. Cool, dark, airtight cupboard. Use within 3–4 weeks of roast.",
  "Shoutout to our wholesale partner Harbor Books — you can now grab a Northwind drip while you browse. Dangerous combination.",
  "Brew ratio cheat sheet: 1:16 for pour-over, 1:15 for French press, 1:2 for espresso. Save this for later.",
  "We're testing a new seasonal drink and need volunteers. Free samples at the Harbor St. counter, 2–4pm. Honest opinions only.",
  "Three things we look for in a green coffee sample: clean cup, sweetness and a story we're proud to tell.",
  "It's a pour-over kind of afternoon. Slow down, watch the bloom, take the long way home.",
  "Barista training day: our whole team spent Monday re-calibrating grinders and tasting 40 shots. Your Tuesday latte thanks them.",
  "Gift idea for the coffee person in your life: our 3-month origin subscription. They'll think of you every morning.",
  "Grand opening at Elm Park is set! Free drip for the first 100 guests and a live roasting demo at noon.",
  "Last call for summer menu favorites. The lavender honey latte rides off into the sunset on Sunday.",
];
const ERROR_MSGS = [
  { kind: "rejected", message: "Media aspect ratio not supported for this placement (use 4:5 or 1:1)." },
  { kind: "auth", message: "Access token expired. Reconnect the channel to keep publishing." },
];

// ───────────────────────── channels ─────────────────────────
interface ChannelSpec {
  network: Network;
  name: string;
  username: string;
  followers: number;
  dailyGrowth: number;
  reach: number; // typical impressions per post as fraction of followers
  er: number; // engagement rate
}
const CHANNELS: ChannelSpec[] = [
  { network: "INSTAGRAM", name: "Northwind Coffee", username: "northwind.coffee", followers: 18400, dailyGrowth: 34, reach: 0.42, er: 0.058 },
  { network: "FACEBOOK", name: "Northwind Coffee Co.", username: "northwindcoffeeco", followers: 9200, dailyGrowth: 9, reach: 0.25, er: 0.031 },
  { network: "TIKTOK", name: "Northwind Coffee", username: "northwindbrews", followers: 12600, dailyGrowth: 58, reach: 0.95, er: 0.072 },
  { network: "X", name: "Northwind Coffee", username: "northwindcoffee", followers: 4100, dailyGrowth: 4, reach: 0.36, er: 0.022 },
  { network: "LINKEDIN_PAGE", name: "Northwind Coffee Co.", username: "northwind-coffee-co", followers: 2300, dailyGrowth: 6, reach: 0.55, er: 0.041 },
  { network: "THREADS", name: "Northwind Coffee", username: "northwind.coffee", followers: 3600, dailyGrowth: 15, reach: 0.4, er: 0.047 },
  { network: "BLUESKY", name: "Northwind Coffee", username: "northwind.coffee", followers: 1450, dailyGrowth: 7, reach: 0.6, er: 0.064 },
  { network: "MASTODON", name: "Northwind Coffee", username: "northwind@mastodon.social", followers: 820, dailyGrowth: 2, reach: 0.7, er: 0.052 },
];

const MEDIA = [
  { file: "morning-pour.svg", alt: "Abstract illustration of a cup of coffee with rising steam", w: 1080, h: 1080 },
  { file: "bean-origins.svg", alt: "Stylised coffee beans on a dark roast background", w: 1080, h: 1080 },
  { file: "cold-brew.svg", alt: "Illustrated glass of cold brew with ice cubes", w: 1080, h: 1350 },
  { file: "latte-art.svg", alt: "Top-down illustration of latte art in a cup", w: 1080, h: 1080 },
  { file: "pastry-case.svg", alt: "Illustrated croissant and pastry", w: 1080, h: 1080 },
  { file: "community-night.svg", alt: "Illustration of people gathered under string lights", w: 1080, h: 1080 },
];

// Hour/weekday performance pattern (local time). Peaks at breakfast, lunch and early evening; Tue–Thu best.
const HOUR_FACTOR = (h: number) => {
  const peaks = [
    [8, 1.35],
    [12, 1.2],
    [18, 1.45],
  ] as const;
  let f = 0.65;
  for (const [ph, amp] of peaks) f = Math.max(f, amp * Math.exp(-((h - ph) ** 2) / 3));
  return f;
};
const WEEKDAY_FACTOR = [0.8, 0.95, 1.18, 1.25, 1.12, 1.0, 0.85];

async function main() {
  const t0 = Date.now();
  const hash = await bcrypt.hash(PASSWORD, 10);

  // ── owner ──
  let owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (!owner) owner = await prisma.user.create({ data: { email: OWNER_EMAIL, name: "Sam Rivera", passwordHash: hash, emailVerified: new Date() } });
  else if (!owner.passwordHash) owner = await prisma.user.update({ where: { id: owner.id }, data: { passwordHash: hash } });

  // ── cleanup (idempotent) ──
  const old = await prisma.brand.findMany({ where: { ownerId: owner.id, name: BRAND_NAME }, select: { id: true } });
  const oldIds = old.map((b) => b.id);
  if (oldIds.length) {
    await prisma.creditLedger.deleteMany({ where: { brandId: { in: oldIds } } });
    await prisma.notification.deleteMany({ where: { brandId: { in: oldIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: oldIds } } });
  }
  await prisma.creditLedger.deleteMany({ where: { userId: owner.id, refType: "demo" } });
  await prisma.bioPage.deleteMany({ where: { slug: BIO_SLUG } });

  // ── team users ──
  const team: { email: string; name: string; role: Role }[] = [
    { email: "maya.chen@northwind.demo", name: "Maya Chen", role: "ADMIN" },
    { email: "leo.okafor@northwind.demo", name: "Leo Okafor", role: "MANAGER" },
    { email: "priya.nair@harborpartners.demo", name: "Priya Nair", role: "CLIENT" },
  ];
  const teamUsers = await Promise.all(
    team.map((t) =>
      prisma.user.upsert({
        where: { email: t.email },
        update: { name: t.name },
        create: { email: t.email, name: t.name, passwordHash: hash, emailVerified: new Date() },
      }),
    ),
  );
  const [maya, leo, priya] = teamUsers as [typeof owner, typeof owner, typeof owner];
  const authors = [owner, maya, leo];

  // ── brand ──
  const brand = await prisma.brand.create({
    data: {
      ownerId: owner.id,
      name: BRAND_NAME,
      website: "https://northwind-coffee.example.com",
      description:
        "Northwind Coffee Co. is an independent specialty roaster with two neighborhood cafés (Harbor St. and the new Elm Park shop) and a coffee subscription. We roast small batches twice a week, buy directly from farms we know by name, and run a cup-refill program that has kept thousands of cups out of landfills.",
      voice:
        "Warm, curious and a little playful — like a barista who loves explaining things without being a snob. Short sentences. Concrete sensory details (tasting notes, sounds, smells). Light humor is welcome; jargon only when we explain it. Never preachy about sustainability — show, don't lecture.",
      audience:
        "Local coffee lovers aged 22–45, remote workers who treat the café as an office, home brewers who want to level up, and gift buyers looking for a thoughtful subscription.",
      avoid: "Calling competitors out by name, health claims about caffeine, the words 'hustle' and 'grindset', excessive emoji.",
      logos: json([
        { url: `${APP_URL}/demo/logo.svg`, kind: "icon" },
        { url: `${APP_URL}/demo/logo-wordmark.svg`, kind: "wordmark" },
      ]),
      // Espresso, cream, terracotta, sage.
      colors: json(["#3B2416", "#F3E7D9", "#C2643A", "#7A9E7E"]),
      timezone: TZ,
      weekStart: 1,
    },
  });
  await prisma.membership.create({ data: { userId: owner.id, brandId: brand.id, role: "OWNER" } });
  for (const [i, u] of teamUsers.entries()) await prisma.membership.create({ data: { userId: u.id, brandId: brand.id, role: team[i]!.role } });

  // ── channels ──
  const emptyCreds = encryptCredentials({});
  const channels = [];
  for (const c of CHANNELS) {
    const ch = await prisma.channel.create({
      data: {
        brandId: brand.id,
        network: c.network,
        externalId: `demo-${c.network.toLowerCase()}-northwind`,
        name: c.name,
        username: c.username,
        avatarUrl: "/demo/logo.svg",
        credentialsEnc: emptyCreds,
        scopes: [],
        health: "OK",
        extras: json({ demo: true }),
        inboxEnabled: c.network === "FACEBOOK" || c.network === "INSTAGRAM",
      },
    });
    channels.push({ ...ch, spec: c });
  }
  const chBy = (n: Network) => channels.find((c) => c.network === n)!;

  // Posting slots (Mon–Fri 8:30, 12:15, 18:00) for the main channels.
  for (const ch of channels.slice(0, 4))
    for (let wd = 1; wd <= 5; wd++)
      for (const m of [510, 735, 1080]) await prisma.postingSlot.create({ data: { channelId: ch.id, weekday: wd, minute: m } });

  // ── labels & hashtags ──
  const labelSpecs = [
    ["Product", "#C8875A"],
    ["Behind the scenes", "#7A9E7E"],
    ["Community", "#4C6EF5"],
    ["Promo", "#E2A33B"],
    ["Education", "#7950F2"],
    ["Hiring", "#E64980"],
  ] as const;
  const labels = [];
  for (const [name, color] of labelSpecs) labels.push(await prisma.label.create({ data: { brandId: brand.id, name, color } }));
  await prisma.hashtagLibrary.createMany({
    data: [
      { brandId: brand.id, name: "Everyday coffee", tags: ["#specialtycoffee", "#coffeetime", "#morningcoffee", "#coffeelover", "#northwindcoffee"] },
      { brandId: brand.id, name: "Home brewing", tags: ["#pourover", "#homebarista", "#brewguide", "#aeropress", "#coffeegeek"] },
      { brandId: brand.id, name: "Local & community", tags: ["#shoplocal", "#harborstreet", "#elmpark", "#supportsmallbusiness", "#coffeeshopvibes"] },
      { brandId: brand.id, name: "Sustainability", tags: ["#directtrade", "#zerowaste", "#refillnotlandfill", "#ethicalcoffee"] },
    ],
  });

  // ── media ──
  const media = [];
  for (const m of MEDIA) {
    let size = 2000;
    try {
      size = statSync(join(PUBLIC_DEMO, m.file)).size;
    } catch {
      /* file missing — keep a placeholder size */
    }
    media.push(
      await prisma.mediaAsset.create({
        data: { brandId: brand.id, url: `/demo/${m.file}`, mime: "image/svg+xml", width: m.w, height: m.h, sizeBytes: size, source: "upload", alt: m.alt },
      }),
    );
  }

  // ── campaigns (posts attached below) ──
  const elmChannels = [chBy("INSTAGRAM"), chBy("FACEBOOK"), chBy("TIKTOK"), chBy("THREADS")];
  const campaignOpening = await prisma.campaign.create({
    data: {
      brandId: brand.id,
      prompt: "Build excitement for the Elm Park café grand opening: sneak peeks of the build-out, meet the team, opening-day perks.",
      goal: "launch",
      audience: "Neighbors in Elm Park and existing Harbor St. regulars",
      startDate: localAt(3, 0),
      duration: 14,
      postsPerDay: 0.5,
      count: 6,
      status: "READY",
      channelIds: elmChannels.map((c) => c.id),
      plan: json([
        { dayOffset: 0, time: "08:30", angle: "Teaser: the window bar", caption: "", hashtags: ["#elmpark"] },
        { dayOffset: 2, time: "12:15", angle: "Meet the Elm Park crew", caption: "", hashtags: ["#meettheteam"] },
        { dayOffset: 5, time: "18:00", angle: "Build-out timelapse", caption: "", hashtags: ["#behindthescenes"] },
        { dayOffset: 8, time: "08:30", angle: "Opening-day perks", caption: "", hashtags: ["#grandopening"] },
        { dayOffset: 11, time: "12:15", angle: "Countdown: 3 days", caption: "", hashtags: ["#elmpark"] },
        { dayOffset: 13, time: "08:00", angle: "We're open!", caption: "", hashtags: ["#grandopening", "#shoplocal"] },
      ]),
    },
  });
  const campaignHoliday = await prisma.campaign.create({
    data: {
      brandId: brand.id,
      prompt: "Pre-orders for the limited Holiday Blend (cocoa nib, orange peel). Drive subscription gifts.",
      goal: "offer",
      audience: "Gift buyers and subscription members",
      startDate: localAt(7, 0),
      duration: 12,
      postsPerDay: 0.4,
      count: 5,
      status: "READY",
      channelIds: [chBy("INSTAGRAM").id, chBy("FACEBOOK").id, chBy("X").id, chBy("BLUESKY").id],
      plan: json([
        { dayOffset: 0, time: "09:00", angle: "Announce pre-orders", caption: "", hashtags: ["#holidayblend"] },
        { dayOffset: 3, time: "12:00", angle: "Tasting notes with Rosa", caption: "", hashtags: ["#tastingnotes"] },
        { dayOffset: 6, time: "18:00", angle: "Gift subscription angle", caption: "", hashtags: ["#giftideas"] },
        { dayOffset: 9, time: "08:30", angle: "Only 200 bags left", caption: "", hashtags: ["#limitededition"] },
        { dayOffset: 11, time: "17:30", angle: "Last day to pre-order", caption: "", hashtags: ["#lastchance"] },
      ]),
    },
  });

  const OPENING_CAPS = [
    "Elm Park sneak peek: that's a window bar made for slow mornings and people-watching. Two weeks to go.",
    "Meet the Elm Park crew — six baristas, one very competitive milk-steaming leaderboard. Say hi when we open!",
    "From bare walls to warm oak in 30 days. Here's the Elm Park build-out in 30 seconds.",
    "Opening day perks: free drip for the first 100 guests, live roasting at noon, and pastries from Little Oven Bakery.",
    "Three days. The grinders are calibrated, the cups are stacked and we are extremely ready.",
    "We're open! Elm Park, come on in — the first cortado is on us.",
  ];
  const HOLIDAY_CAPS = [
    "Holiday Blend pre-orders are open. Cocoa nib, orange peel and a long, cozy finish. Ships the first week of December.",
    "Rosa on the Holiday Blend: \"It tastes like the good part of winter.\" We're going with that.",
    "The easiest gift you'll give this year: a 3-month Northwind subscription with a bag of Holiday Blend to start.",
    "Only 200 bags of Holiday Blend left. When it's gone, it's gone until next year.",
    "Last day to pre-order Holiday Blend. Tomorrow it's just a memory (and a very nice one).",
  ];

  // ── post groups ──
  interface GroupSpec {
    caption: string;
    status: PostStatus;
    at: Date | null;
    channels: typeof channels;
    campaignId?: string;
    labels: string[];
    mediaIdx: number | null;
    notes?: string;
    errorChannels?: number; // how many channel posts failed (NEEDS_ATTENTION/ERROR)
  }
  const specs: GroupSpec[] = [];
  let capIdx = 0;
  const nextCaption = () => CAPTIONS[capIdx++ % CAPTIONS.length]!;
  const pickChannels = () => {
    const main = sample(channels.slice(0, 4), int(1, 3));
    const extra = rand() < 0.6 ? sample(channels.slice(4), int(1, 2)) : [];
    return [...main, ...extra];
  };
  const slotHour = () => pick([8, 8, 9, 12, 12, 13, 17, 18, 18, 19, 15, 10, 20]);

  // Past: 12 posts 31–60 days ago (for period comparison) + ~36 over the last 30 days.
  const pastDays: number[] = [];
  for (let d = 60; d >= 31; d -= int(2, 3)) pastDays.push(-d);
  for (let d = 30; d >= 1; d--) {
    pastDays.push(-d);
    if (rand() < 0.25) pastDays.push(-d);
  }
  for (const d of pastDays) {
    specs.push({
      caption: nextCaption(),
      status: "POSTED",
      at: localAt(d, slotHour(), pick([0, 0, 15, 30, 45])),
      channels: pickChannels(),
      labels: sample(labels.map((l) => l.id), int(0, 2)),
      mediaIdx: rand() < 0.7 ? int(0, media.length - 1) : null,
    });
  }
  // A couple of failed publishes in the past week.
  specs.push({
    caption: "Latte art throwdown recap: 14 baristas, one rosetta that made the judges gasp. Full gallery on our page.",
    status: "NEEDS_ATTENTION",
    at: localAt(-3, 18, 0),
    channels: [chBy("INSTAGRAM"), chBy("FACEBOOK"), chBy("THREADS")],
    labels: [labels[2]!.id],
    mediaIdx: 3,
    errorChannels: 1,
  });
  specs.push({
    caption: "Flash sale: 20% off all subscription first boxes this weekend only. Use code NORTHWIND20.",
    status: "ERROR",
    at: localAt(-1, 12, 0),
    channels: [chBy("X"), chBy("LINKEDIN_PAGE")],
    labels: [labels[3]!.id],
    mediaIdx: null,
    errorChannels: 2,
  });

  // Future: next 21 days.
  OPENING_CAPS.forEach((caption, i) => {
    const plan = [3, 5, 8, 11, 14, 16][i]!;
    specs.push({
      caption,
      status: i === 3 ? "PENDING_APPROVAL" : "SCHEDULED",
      at: localAt(plan, [8, 12, 18, 8, 12, 8][i]!, [30, 15, 0, 30, 15, 0][i]!),
      channels: elmChannels,
      campaignId: campaignOpening.id,
      labels: [labels[0]!.id, labels[2]!.id],
      mediaIdx: [5, 5, 4, 0, 3, 0][i]!,
    });
  });
  HOLIDAY_CAPS.forEach((caption, i) => {
    const plan = [7, 10, 13, 16, 18][i]!;
    specs.push({
      caption,
      status: i === 4 ? "DRAFT" : "SCHEDULED",
      at: localAt(plan, [9, 12, 18, 8, 17][i]!, [0, 0, 0, 30, 30][i]!),
      channels: [chBy("INSTAGRAM"), chBy("FACEBOOK"), chBy("X"), chBy("BLUESKY")],
      campaignId: campaignHoliday.id,
      labels: [labels[3]!.id, labels[0]!.id],
      mediaIdx: [1, 0, 2, 1, 1][i]!,
    });
  });
  const futureStatuses: PostStatus[] = ["SCHEDULED", "SCHEDULED", "SCHEDULED", "SCHEDULED", "SCHEDULED", "DRAFT", "DRAFT", "DRAFT", "PENDING_APPROVAL", "PENDING_APPROVAL", "SCHEDULED", "DRAFT"];
  futureStatuses.forEach((status, i) => {
    const day = 1 + Math.round((i * 20) / futureStatuses.length) + int(0, 1);
    specs.push({
      caption: nextCaption(),
      status,
      at: status === "DRAFT" && i % 2 === 1 ? null : localAt(day, slotHour(), pick([0, 15, 30])),
      channels: pickChannels(),
      labels: sample(labels.map((l) => l.id), int(1, 2)),
      mediaIdx: rand() < 0.6 ? int(0, media.length - 1) : null,
      notes: status === "PENDING_APPROVAL" ? "Priya — can you confirm the promo wording works for Harbor Partners?" : undefined,
    });
  });

  // Daily per-channel extra impressions/engagement contributed by posts (for ChannelMetric consistency).
  const postContrib = new Map<string, { impressions: number; engagement: number }>();
  let groupCount = 0;
  let postCount = 0;
  let metricCount = 0;

  for (const s of specs) {
    const author = s.status === "PENDING_APPROVAL" ? leo : pick(authors);
    const scheduledAt = s.at;
    const isPast = s.status === "POSTED" || s.status === "NEEDS_ATTENTION" || s.status === "ERROR";
    const group = await prisma.postGroup.create({
      data: {
        brandId: brand.id,
        authorId: author.id,
        caption: s.caption,
        status: s.status,
        scheduledAt,
        notes: s.notes,
        score: int(62, 96),
        campaignId: s.campaignId,
        publishedAt: isPast && s.status !== "ERROR" ? scheduledAt : null,
        lockedAt: isPast ? scheduledAt : null,
        createdAt: scheduledAt ? new Date(scheduledAt.getTime() - int(2, 9) * DAY) : new Date(),
        labels: { create: s.labels.map((labelId) => ({ labelId })) },
        media: s.mediaIdx !== null ? { create: [{ mediaId: media[s.mediaIdx]!.id, position: 0 }] } : undefined,
      },
    });
    groupCount++;

    if (s.status === "PENDING_APPROVAL")
      await prisma.approval.create({ data: { groupId: group.id, requestedBy: leo.id, approverIds: [priya.id, maya.id] } });
    if (rand() < 0.25 || s.status === "PENDING_APPROVAL")
      await prisma.postComment.create({
        data: {
          groupId: group.id,
          authorId: pick([maya, leo]).id,
          body: pick(["Love this one. Can we add the Elm Park address?", "Swapped the photo for the brighter version.", "Approved from my side 👍", "Let's post this at lunch instead — better engagement last month."]),
        },
      });

    let failed = s.errorChannels ?? 0;
    for (const ch of s.channels) {
      let status: PostStatus = s.status;
      if (s.status === "NEEDS_ATTENTION" || s.status === "ERROR") {
        status = failed > 0 ? "ERROR" : "POSTED";
        failed--;
      }
      const posted = status === "POSTED";
      const extId = posted ? `demo-${ch.network.toLowerCase()}-${group.id.slice(-8)}` : null;
      const post = await prisma.post.create({
        data: {
          groupId: group.id,
          channelId: ch.id,
          status,
          externalId: extId,
          partIds: extId ? [extId] : [],
          url: posted ? `https://example.com/northwind/${ch.network.toLowerCase()}/${group.id.slice(-8)}` : null,
          error: status === "ERROR" ? json({ ...pick(ERROR_MSGS), at: scheduledAt?.toISOString() }) : undefined,
          attempts: isPast ? (status === "ERROR" ? 3 : 1) : 0,
          publishedAt: posted ? scheduledAt : null,
        },
      });
      postCount++;
      if (!posted || !scheduledAt) continue;

      // Metric snapshots: +3h, +24h, +72h, latest — growing toward a final value.
      const sp = ch.spec;
      const local = new Date(scheduledAt.getTime() + tzOffsetMs(scheduledAt, TZ));
      const perf = HOUR_FACTOR(local.getUTCHours()) * WEEKDAY_FACTOR[localWeekday(scheduledAt)]! * between(0.65, 1.45) * (s.mediaIdx !== null ? 1.15 : 0.9);
      const finalImpr = Math.round(sp.followers * sp.reach * perf);
      const finalEr = sp.er * between(0.7, 1.35) * Math.sqrt(perf);
      const finalEng = finalImpr * finalEr;
      const ageH = (Date.now() - scheduledAt.getTime()) / 3600_000;
      const checkpoints = [3, 24, 72, 24 * 7].filter((h) => h < ageH);
      checkpoints.push(ageH);
      for (const h of checkpoints) {
        const f = 1 - Math.exp(-h / 20);
        const impressions = Math.round(finalImpr * f);
        const eng = finalEng * f;
        await prisma.postMetric.create({
          data: {
            postId: post.id,
            capturedAt: new Date(scheduledAt.getTime() + h * 3600_000),
            impressions,
            reach: Math.round(impressions * between(0.7, 0.88)),
            likes: Math.round(eng * 0.72),
            comments: Math.round(eng * 0.09),
            shares: Math.round(eng * 0.11),
            saves: Math.round(eng * 0.08),
            clicks: Math.round(impressions * between(0.004, 0.016)),
            videoViews: ch.network === "TIKTOK" ? Math.round(impressions * 1.1) : 0,
          },
        });
        metricCount++;
      }
      const k = `${ch.id}|${utcDay(scheduledAt).toISOString()}`;
      const c = postContrib.get(k) ?? { impressions: 0, engagement: 0 };
      c.impressions += finalImpr;
      c.engagement += Math.round(finalEng);
      postContrib.set(k, c);
    }
  }

  // ── channel metrics: 90 days of daily followers / impressions / engagement ──
  const today = utcDay(new Date());
  const chMetricRows: Prisma.ChannelMetricCreateManyInput[] = [];
  for (const ch of channels) {
    const sp = ch.spec;
    let followers = Math.round(sp.followers - sp.dailyGrowth * 90 * 1.05);
    for (let d = 89; d >= 0; d--) {
      const date = new Date(today.getTime() - d * DAY);
      const wd = date.getUTCDay();
      const contrib = postContrib.get(`${ch.id}|${date.toISOString()}`);
      // Growth accelerates in the most recent 30 days (more consistent posting).
      const momentum = d < 30 ? 1.25 : 0.85;
      followers += Math.max(0, Math.round(sp.dailyGrowth * momentum * between(0.4, 1.6) + (contrib ? contrib.engagement * 0.04 : 0)));
      const organic = Math.round(sp.followers * 0.035 * WEEKDAY_FACTOR[wd]! * between(0.7, 1.3) * (d < 30 ? 1.1 : 0.9));
      const impressions = organic + (contrib?.impressions ?? 0);
      const engagement = Math.round(organic * sp.er * 0.6) + (contrib?.engagement ?? 0);
      chMetricRows.push({ channelId: ch.id, date, followers, impressions, engagement, profileViews: Math.round(impressions * between(0.01, 0.03)) });
    }
  }
  await prisma.channelMetric.createMany({ data: chMetricRows });

  // ── workflows ──
  const agentWriter = await prisma.aIAgent.create({
    data: {
      brandId: brand.id,
      name: "Blog-to-social writer",
      prompt:
        "You turn Northwind Coffee blog posts into a short, warm social caption (max 220 characters) in the brand voice, ending with a question that invites replies. Mention one concrete tasting note or detail from the article.",
      imageGen: true,
    },
  });
  const agentReplies = await prisma.aIAgent.create({
    data: {
      brandId: brand.id,
      name: "Friendly comment replier",
      prompt:
        "Reply to customer comments as a Northwind barista: thank them by first name when known, answer questions about hours, menu and beans briefly, and never promise discounts. Keep it under 2 sentences.",
      webSearch: false,
    },
  });

  const wfSpecs = [
    {
      name: "Blog RSS → Instagram & Facebook",
      active: true,
      trigger: { type: "rss", config: { url: "https://northwind-coffee.example.com/journal/rss.xml", every: "1h" } },
      steps: [
        { id: "s1", type: "ai_agent", config: { agentId: agentWriter.id, input: "{{trigger.title}}\n{{trigger.summary}}" } },
        { id: "s2", type: "create_post", config: { channelIds: [chBy("INSTAGRAM").id, chBy("FACEBOOK").id], caption: "{{s1.output}}", mode: "draft" } },
      ],
      runs: ["SUCCESS", "SUCCESS", "FILTERED", "SUCCESS", "SUCCESS", "ERROR", "SUCCESS"],
      inputs: [{ title: "Five ways to dial in pour-over at home", link: "https://northwind-coffee.example.com/journal/pour-over" }],
    },
    {
      name: "Auto-reply to Instagram comments",
      active: true,
      trigger: { type: "new_comment", config: { channelIds: [chBy("INSTAGRAM").id] } },
      steps: [
        { id: "s1", type: "filter", config: { field: "trigger.text", op: "not_contains", value: "http" } },
        { id: "s2", type: "ai_agent", config: { agentId: agentReplies.id, input: "{{trigger.authorName}}: {{trigger.text}}" } },
        { id: "s3", type: "reply_comment", config: { text: "{{s2.output}}" } },
      ],
      runs: ["SUCCESS", "SUCCESS", "SUCCESS", "FILTERED", "SUCCESS", "SUCCESS", "FILTERED", "SUCCESS", "ERROR", "SUCCESS"],
      inputs: [{ authorName: "jess.m", text: "Do you have oat milk at Elm Park?" }],
    },
    {
      name: "Weekly roast announcement",
      active: true,
      trigger: { type: "schedule", config: { cron: "0 8 * * 2", timezone: TZ } },
      steps: [
        { id: "s1", type: "ai_agent", config: { agentId: agentWriter.id, input: "Announce this week's roast. Origin of the week rotates." } },
        { id: "s2", type: "create_post", config: { channelIds: channels.slice(0, 4).map((c) => c.id), caption: "{{s1.output}}", mode: "schedule", delayMinutes: 30 } },
      ],
      runs: ["SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS"],
      inputs: [{ firedAt: "tuesday" }],
    },
    {
      name: "Shop webhook → new product post",
      active: false,
      trigger: { type: "webhook", config: {} },
      steps: [
        { id: "s1", type: "filter", config: { field: "trigger.stock", op: "gt", value: 0 } },
        { id: "s2", type: "delay", config: { minutes: 15 } },
        { id: "s3", type: "create_post", config: { channelIds: [chBy("INSTAGRAM").id, chBy("X").id], caption: "New in the shop: {{trigger.name}} — {{trigger.url}}", mode: "draft" } },
      ],
      runs: ["SUCCESS", "ERROR", "FILTERED"],
      inputs: [{ name: "Panama Geisha 2026", url: "https://northwind-coffee.example.com/shop/geisha", stock: 40 }],
    },
  ];
  let runCount = 0;
  for (const w of wfSpecs) {
    const wf = await prisma.workflow.create({
      data: {
        brandId: brand.id,
        name: w.name,
        active: w.active,
        trigger: json(w.trigger),
        steps: json(w.steps),
        layout: json(Object.fromEntries([["trigger", { x: 250, y: 40 }], ...w.steps.map((s, i) => [s.id, { x: 250, y: 180 + i * 150 }])])),
      },
    });
    let last: Date | null = null;
    for (const [i, status] of w.runs.entries()) {
      const startedAt = new Date(Date.now() - (w.runs.length - i) * between(0.6, 2.4) * DAY);
      const log: unknown[] = [];
      let t = startedAt.getTime();
      let errorMsg: string | null = null;
      for (const [si, step] of w.steps.entries()) {
        const dur = int(300, 4200);
        const isFilterStop = status === "FILTERED" && step.type === "filter";
        const isErr = status === "ERROR" && si === w.steps.length - 1;
        const entry = {
          stepId: step.id,
          type: step.type,
          status: isErr ? "ERROR" : isFilterStop ? "FILTERED" : "SUCCESS",
          output:
            step.type === "ai_agent"
              ? { text: pick(CAPTIONS).slice(0, 180) }
              : step.type === "create_post"
                ? { groupId: null, status: "DRAFT" }
                : step.type === "filter"
                  ? { passed: !isFilterStop }
                  : step.type === "reply_comment"
                    ? { replied: true }
                    : {},
          error: isErr ? (step.type === "create_post" ? "Channel limit reached for this plan" : "Network rejected the reply (comment was deleted)") : null,
          startedAt: new Date(t).toISOString(),
          finishedAt: new Date(t + dur).toISOString(),
        };
        if (isErr) errorMsg = entry.error;
        log.push(entry);
        t += dur;
        if (isFilterStop || isErr) break;
      }
      // RSS filtered-out runs: no filter step — mark the agent step as filtered (duplicate item).
      if (status === "FILTERED" && !w.steps.some((s) => s.type === "filter")) {
        log.length = 0;
        log.push({ stepId: "trigger", type: "trigger", status: "FILTERED", output: { reason: "Item already processed" }, error: null, startedAt: startedAt.toISOString(), finishedAt: startedAt.toISOString() });
      }
      await prisma.workflowRun.create({
        data: { workflowId: wf.id, status, input: json(w.inputs[0]), log: json(log), error: errorMsg, startedAt, finishedAt: new Date(t) },
      });
      last = startedAt;
      runCount++;
    }
    await prisma.workflow.update({ where: { id: wf.id }, data: { lastRunAt: last } });
  }

  // ── inbox ──
  const people = [
    ["Jess Morales", "jess.m"],
    ["Daniel Kim", "dkim.brews"],
    ["Amara Osei", "amara.osei"],
    ["Tom Becker", "tombecker"],
    ["Lucía Ferreira", "lucia.ferreira"],
    ["Hannah Wright", "hannahw"],
    ["Marcus Lee", "marcuslee_"],
    ["Sofia Rossi", "sofiarossi"],
    ["Ben Carter", "bencarter.design"],
    ["Aisha Rahman", "aisha.r"],
    ["Noah Fischer", "noahfischer"],
    ["Grace Liu", "grace.liu"],
    ["Omar Haddad", "omar.haddad"],
    ["Elena Petrova", "elenap"],
    ["Chris Nolan", "cnolan.photo"],
  ] as const;
  const threads: { kind: "DM" | "COMMENT" | "MENTION"; network: Network; msgs: [string, string][]; status?: string }[] = [
    { kind: "DM", network: "INSTAGRAM", msgs: [["IN", "Hi! Do you ship the subscription to Canada?"]] },
    { kind: "DM", network: "INSTAGRAM", msgs: [["IN", "Is the Elm Park location going to have wifi? Looking for a new remote-work spot 😅"], ["OUT", "It sure will — fast wifi and plenty of outlets along the window bar!"], ["IN", "Perfect, see you opening day"]], status: "RESOLVED" },
    { kind: "COMMENT", network: "INSTAGRAM", msgs: [["IN", "That maple cortado is dangerously good"]] },
    { kind: "COMMENT", network: "INSTAGRAM", msgs: [["IN", "What grinder do you use for the pour-over bar?"]] },
    { kind: "DM", network: "FACEBOOK", msgs: [["IN", "Hello, we're organizing a team offsite for 25 people. Do you do catering for coffee and pastries?"]] },
    { kind: "COMMENT", network: "FACEBOOK", msgs: [["IN", "Are you open on Thanksgiving?"], ["OUT", "We're open 7am–1pm on Thanksgiving Day at Harbor St.!"]], status: "RESOLVED" },
    { kind: "MENTION", network: "INSTAGRAM", msgs: [["IN", "Best Sunday ritual: @northwind.coffee cold brew + a long walk by the harbor"]] },
    { kind: "DM", network: "INSTAGRAM", msgs: [["IN", "My subscription box arrived with a torn bag 😕 order #NW-48211"]] },
    { kind: "COMMENT", network: "INSTAGRAM", msgs: [["IN", "Can I bring my dog inside or just the patio?"]] },
    { kind: "COMMENT", network: "FACEBOOK", msgs: [["IN", "The cardamom buns sold out before I got there AGAIN. Can you save me one? 😂"]] },
    { kind: "DM", network: "FACEBOOK", msgs: [["IN", "Hi, I'm a local illustrator — would you be open to a collab on a limited bag design?"]] },
    { kind: "MENTION", network: "FACEBOOK", msgs: [["IN", "Shoutout to Northwind Coffee Co. for hosting our book club every month ❤️"]] },
    { kind: "COMMENT", network: "INSTAGRAM", msgs: [["IN", "Is the decaf done with Swiss Water? Asking for my pregnant wife"], ["OUT", "Yes! Our Peru decaf is 100% Swiss Water Process, no chemicals."]], status: "RESOLVED" },
    { kind: "DM", network: "INSTAGRAM", msgs: [["IN", "Do you have any barista jobs open at Elm Park? I have 2 years experience"]] },
    { kind: "COMMENT", network: "INSTAGRAM", msgs: [["IN", "What are the tasting notes on the Kenya?"]] },
    { kind: "COMMENT", network: "INSTAGRAM", msgs: [["IN", "Latte art throwdown when?? I want in"]] },
    { kind: "DM", network: "FACEBOOK", msgs: [["IN", "Can I change my subscription delivery day to Fridays?"], ["OUT", "Absolutely — you can do it in your account under Deliveries, or I can switch it for you. Which do you prefer?"], ["IN", "Could you do it for me? Thanks!"]] },
    { kind: "MENTION", network: "INSTAGRAM", msgs: [["IN", "Tried the iced brown sugar shaken espresso at @northwind.coffee and I get the hype now"]] },
    { kind: "COMMENT", network: "FACEBOOK", msgs: [["IN", "Any vegan pastries?"]] },
    { kind: "COMMENT", network: "INSTAGRAM", msgs: [["IN", "Gorgeous photo! Is that the new space?"]], status: "RESOLVED" },
    { kind: "DM", network: "INSTAGRAM", msgs: [["IN", "Do you sell gift cards online?"]] },
    { kind: "COMMENT", network: "INSTAGRAM", msgs: [["IN", "Please bring back the lavender honey latte 🙏"]] },
    { kind: "MENTION", network: "FACEBOOK", msgs: [["IN", "Northwind Coffee Co. is the reason I'm a morning person now"]], status: "ARCHIVED" },
    { kind: "DM", network: "FACEBOOK", msgs: [["IN", "Hi! Our office would love to stock your beans. Do you do wholesale?"]] },
    { kind: "COMMENT", network: "INSTAGRAM", msgs: [["IN", "How long does a bag stay fresh after opening?"]] },
  ];
  let convCount = 0;
  for (const [i, th] of threads.entries()) {
    const [name, handle] = people[i % people.length]!;
    const ch = chBy(th.network);
    const last = new Date(Date.now() - (i * 3 + int(0, 2)) * 3600_000 - int(0, 50) * 60_000);
    const msgs = th.msgs.map(([dir, text], mi) => ({
      direction: dir,
      authorName: dir === "IN" ? name : "Northwind Coffee",
      text,
      externalId: `demo-msg-${i}-${mi}`,
      sentById: dir === "OUT" ? maya.id : null,
      createdAt: new Date(last.getTime() - (th.msgs.length - 1 - mi) * int(5, 40) * 60_000),
    }));
    const lastMsg = th.msgs[th.msgs.length - 1]!;
    await prisma.conversation.create({
      data: {
        brandId: brand.id,
        channelId: ch.id,
        kind: th.kind,
        externalId: `demo-conv-${i}`,
        postExternalId: th.kind === "COMMENT" ? `demo-${th.network.toLowerCase()}-post` : null,
        participantName: name,
        participantHandle: handle,
        status: th.status ?? "OPEN",
        assigneeId: i % 4 === 0 ? maya.id : i % 5 === 0 ? leo.id : null,
        labels: i % 6 === 0 ? ["urgent"] : i % 7 === 0 ? ["wholesale"] : [],
        unread: (th.status ?? "OPEN") === "OPEN" && lastMsg[0] === "IN" && i % 3 !== 2,
        lastMessageAt: last,
        lastMessagePreview: lastMsg[1].slice(0, 140),
        createdAt: msgs[0]!.createdAt,
        messages: { create: msgs },
      },
    });
    convCount++;
  }
  await prisma.replySnippet.createMany({
    data: [
      { brandId: brand.id, title: "Opening hours", body: "We're open 7am–6pm weekdays and 8am–5pm on weekends at both Harbor St. and Elm Park. See you soon!" },
      { brandId: brand.id, title: "Subscription help", body: "You can skip, pause or change your subscription any time from your account under Deliveries. Want me to do it for you?" },
      { brandId: brand.id, title: "Wholesale inquiry", body: "Thanks for thinking of us! Our wholesale team will reach out within 2 business days — could you share your email and roughly how much coffee you go through per week?" },
      { brandId: brand.id, title: "Damaged order", body: "So sorry about that! Send us your order number and we'll ship a replacement bag right away, on us." },
    ],
  });

  // ── bio page + 30 days of events ──
  const blocks = [
    { id: "b_header", type: "header", label: "Freshly roasted, twice a week" },
    { id: "b_shop", type: "link", label: "Shop beans & subscriptions", url: "https://northwind-coffee.example.com/shop" },
    { id: "b_holiday", type: "link", label: "Pre-order the Holiday Blend", url: "https://northwind-coffee.example.com/holiday" },
    { id: "b_elm", type: "link", label: "Elm Park grand opening — RSVP", url: "https://northwind-coffee.example.com/elm-park" },
    { id: "b_image", type: "image", label: "Our latest roast", imageUrl: "/demo/bean-origins.svg", url: "https://northwind-coffee.example.com/journal" },
    { id: "b_text", type: "text", text: "Two neighborhood cafés, one roastery and a lot of very good coffee. Open daily from 7am." },
    { id: "b_video", type: "embed", label: "How we roast", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { id: "b_jobs", type: "link", label: "We're hiring baristas", url: "https://northwind-coffee.example.com/jobs" },
    {
      id: "b_social",
      type: "social",
      links: [
        { network: "instagram", url: "https://instagram.com/northwind.coffee" },
        { network: "tiktok", url: "https://tiktok.com/@northwindbrews" },
        { network: "facebook", url: "https://facebook.com/northwindcoffeeco" },
        { network: "bluesky", url: "https://bsky.app/profile/northwind.coffee" },
        { network: "email", url: "mailto:hello@northwind-coffee.example.com" },
      ],
    },
  ];
  const bio = await prisma.bioPage.create({
    data: {
      brandId: brand.id,
      slug: BIO_SLUG,
      title: "Northwind Coffee Co.",
      bio: "Small-batch roaster & two cafés by the harbor. ☕",
      avatarUrl: "/demo/logo.svg",
      theme: json({ background: { type: "gradient", value: "linear-gradient(160deg, #F3E7D9 0%, #E9CFB2 100%)" }, buttonStyle: "pill", font: "serif", accent: "#3B2416" }),
      blocks: json(blocks),
      published: true,
    },
  });
  const clickWeights: [string, number][] = [
    ["b_shop", 0.16],
    ["b_holiday", 0.11],
    ["b_elm", 0.08],
    ["b_image", 0.03],
    ["b_jobs", 0.025],
  ];
  const referrers = ["instagram.com", "tiktok.com", "facebook.com", "t.co", null, null];
  const events: Prisma.BioPageEventCreateManyInput[] = [];
  for (let d = 29; d >= 0; d--) {
    const dayStart = today.getTime() - d * DAY;
    const views = Math.round((70 + (29 - d) * 2.2) * WEEKDAY_FACTOR[new Date(dayStart).getUTCDay()]! * between(0.7, 1.3));
    for (let v = 0; v < views; v++) {
      const at = new Date(Math.min(Date.now() - 60_000, dayStart + rand() * DAY));
      const referrer = pick(referrers);
      events.push({ pageId: bio.id, kind: "view", referrer, createdAt: at });
      for (const [blockId, p] of clickWeights)
        if (rand() < p) events.push({ pageId: bio.id, kind: "click", blockId, referrer, createdAt: new Date(at.getTime() + int(3, 90) * 1000) });
    }
  }
  await prisma.bioPageEvent.createMany({ data: events });

  // ── subscription & credits ──
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const ledger: Prisma.CreditLedgerCreateManyInput[] = [];
  const reasons: [string, number][] = [
    ["caption", 0.42],
    ["rewrite", 0.2],
    ["hashtags", 0.12],
    ["campaign", 0.1],
    ["reply_suggest", 0.08],
    ["image", 0.05],
    ["workflow_run", 0.03],
  ];
  let used = 0;
  const spanMs = now.getTime() - periodStart.getTime();
  const count = 240;
  for (let i = 0; i < count; i++) {
    let r = rand();
    let reason = "caption";
    for (const [k, w] of reasons) {
      if ((r -= w) <= 0) {
        reason = k;
        break;
      }
    }
    const delta = reason === "campaign" ? -int(5, 11) : reason === "image" ? -int(1, 2) : -1;
    used += -delta;
    ledger.push({
      userId: owner.id,
      brandId: brand.id,
      actorId: pick(authors).id,
      delta,
      reason,
      refType: "demo",
      createdAt: new Date(periodStart.getTime() + (spanMs * (i + rand())) / count),
    });
  }
  // A couple of refunds and last month's refill.
  ledger.push({ userId: owner.id, brandId: brand.id, actorId: leo.id, delta: 1, reason: "refund", refType: "demo", createdAt: new Date(now.getTime() - 2 * DAY) });
  used -= 1;
  ledger.push({ userId: owner.id, delta: 1288, reason: "refill", refType: "demo", createdAt: periodStart });
  await prisma.creditLedger.createMany({ data: ledger });
  await prisma.subscription.upsert({
    where: { userId: owner.id },
    update: { plan: "TEAM", status: "active", periodStart, periodEnd, resetDay: 1, creditsMonthly: PLAN_LIMITS.TEAM.creditsMonthly, creditsUsed: used },
    create: { userId: owner.id, plan: "TEAM", status: "active", periodStart, periodEnd, resetDay: 1, creditsMonthly: PLAN_LIMITS.TEAM.creditsMonthly, creditsUsed: used },
  });

  // ── notifications ──
  await prisma.notification.createMany({
    data: [
      { userId: owner.id, brandId: brand.id, kind: "approval_requested", payload: json({ by: "Leo Okafor", groupCaption: OPENING_CAPS[3] }) },
      { userId: owner.id, brandId: brand.id, kind: "publish_failed", payload: json({ channel: "X (Twitter)", message: "Access token expired." }) },
    ],
  });

  console.log(
    `Seeded "${BRAND_NAME}" (${brand.id}) in ${((Date.now() - t0) / 1000).toFixed(1)}s:` +
      ` ${channels.length} channels, ${groupCount} post groups / ${postCount} posts, ${metricCount} post metrics, ${chMetricRows.length} channel metrics,` +
      ` 2 campaigns, ${wfSpecs.length} workflows / ${runCount} runs, 2 agents, ${convCount} conversations, bio page /b/${BIO_SLUG} (${events.length} events),` +
      ` team: ${team.map((t) => `${t.email} (${t.role})`).join(", ")}; subscription TEAM, ${used} credits used.`,
  );
  console.log(`Open: /app/${brand.id}/planner  — login ${OWNER_EMAIL} / ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

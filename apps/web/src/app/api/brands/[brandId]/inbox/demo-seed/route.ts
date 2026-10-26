// OWNED BY: inbox agent. Dev-only: POST fills the inbox with realistic sample conversations on demo
// Facebook / Instagram channels (created if missing, extras.demo = true). Re-running resets the samples.
import { prisma, Prisma } from "@postline/db";
import { encryptCredentials } from "@postline/core/crypto";
import { HttpError, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";

type Ctx = { params: Promise<{ brandId: string }> };

type Kind = "DM" | "COMMENT" | "MENTION";
interface SeedMsg {
  out?: boolean;
  text: string;
  /** minutes before now */
  ago: number;
}
interface SeedConv {
  net: "FACEBOOK" | "INSTAGRAM";
  kind: Kind;
  name: string;
  handle?: string;
  avatar: number;
  post?: string;
  status?: "OPEN" | "RESOLVED";
  unread?: boolean;
  assignMe?: boolean;
  labels?: string[];
  messages: SeedMsg[];
}

const POSTS = {
  launch: "Meet the Weekender — our new carry-all, built from recycled canvas and made to go anywhere. Available in three colours from today.",
  sale: "Our autumn sale starts now: selected styles are marked down this week only. Which one is going in your basket?",
  behind: "A peek inside the workshop: every strap is cut, stitched and checked by hand before it ships to you.",
  giveaway: "Giveaway time! Tag a friend who needs a new everyday bag and follow us for a chance to win one each.",
};

const SAMPLES: SeedConv[] = [
  {
    net: "INSTAGRAM", kind: "DM", name: "Priya Raman", handle: "priya.travels", avatar: 47, unread: true, labels: ["shipping"],
    messages: [
      { text: "Hi! I ordered the Weekender in olive last Tuesday and the tracking hasn't moved since Friday. Is it stuck somewhere?", ago: 9 },
      { text: "Order number is #48213 if that helps 🙏", ago: 8 },
    ],
  },
  {
    net: "FACEBOOK", kind: "COMMENT", name: "Marcus Bell", avatar: 12, post: POSTS.launch, unread: true, labels: ["pricing"],
    messages: [{ text: "Looks great. What's the price for the large one, and does it fit a 16\" laptop?", ago: 22 }],
  },
  {
    net: "INSTAGRAM", kind: "MENTION", name: "Sofia Lindqvist", handle: "sofia.lindq", avatar: 32, unread: true, labels: ["ugc"],
    messages: [{ text: "Three weeks, four cities, one bag. Honestly the best thing I packed this summer @ourbrand ✈️🧳", ago: 41 }],
  },
  {
    net: "FACEBOOK", kind: "DM", name: "Daniel Okafor", avatar: 15, unread: true, assignMe: true, labels: ["complaint"],
    messages: [
      { text: "Hello, my bag arrived today but the zip on the front pocket is already broken. Pretty disappointed tbh.", ago: 75 },
      { text: "I've attached a photo. Can I get a replacement?", ago: 73 },
    ],
  },
  {
    net: "INSTAGRAM", kind: "COMMENT", name: "Hana Kim", handle: "hanakim.studio", avatar: 44, post: POSTS.sale, unread: true,
    messages: [{ text: "Is the sale online only or in the shop too? 😍", ago: 110 }],
  },
  {
    net: "INSTAGRAM", kind: "COMMENT", name: "Leo Martins", handle: "leo.mrtns", avatar: 59, post: POSTS.behind,
    messages: [
      { text: "Love seeing the process behind it. Do you offer workshop tours?", ago: 180 },
      { out: true, text: "Thanks Leo! We run small open-studio days a few times a year — we'll announce the next one here first.", ago: 150 },
      { text: "Amazing, count me in!", ago: 140 },
    ],
  },
  {
    net: "FACEBOOK", kind: "MENTION", name: "Green Commute Collective", avatar: 3, labels: ["partnership"],
    messages: [{ text: "Shout-out to @ourbrand for sponsoring this weekend's bike-to-work breakfast. 60 riders and plenty of coffee ☕🚲", ago: 260 }],
  },
  {
    net: "INSTAGRAM", kind: "DM", name: "Amelia Clarke", handle: "ameliaclarke", avatar: 25, assignMe: true, labels: ["lead"],
    messages: [
      { text: "Hi there, I run a boutique hotel and we're looking for a supplier for branded guest totes. Do you do wholesale orders?", ago: 320 },
      { out: true, text: "Hi Amelia, thanks for thinking of us! We do — how many pieces are you looking at, and roughly when would you need them?", ago: 300 },
      { text: "Around 200 for the spring season. Could you send over a price list?", ago: 290 },
    ],
  },
  {
    net: "FACEBOOK", kind: "COMMENT", name: "Rachel Nguyen", avatar: 41, post: POSTS.giveaway,
    messages: [{ text: "Tagging my sister Jo — she's been using the same falling-apart backpack since uni 😂", ago: 410 }],
  },
  {
    net: "INSTAGRAM", kind: "COMMENT", name: "Tomás Herrera", handle: "tomas.h", avatar: 53, post: POSTS.launch, labels: ["product"],
    messages: [{ text: "Is the canvas waterproof? Asking for a rainy city 🌧️", ago: 520 }],
  },
  {
    net: "FACEBOOK", kind: "DM", name: "Grace O'Connor", avatar: 20, status: "RESOLVED", labels: ["returns"],
    messages: [
      { text: "Hi, how long do I have to return an item? It's a gift and the colour isn't quite right.", ago: 1500 },
      { out: true, text: "Hi Grace! You have 30 days from delivery, and exchanges for another colour are free. Want me to start one for you?", ago: 1480 },
      { text: "Yes please, that would be great. Thank you!", ago: 1470 },
      { out: true, text: "Done — you'll get a prepaid label by email within the hour. Enjoy the new colour!", ago: 1460 },
    ],
  },
  {
    net: "INSTAGRAM", kind: "MENTION", name: "Kenji Watanabe", handle: "kenji.shoots", avatar: 60, status: "RESOLVED",
    messages: [
      { text: "Golden hour with my favourite camera bag from @ourbrand 📸", ago: 2900 },
      { out: true, text: "This shot is stunning, Kenji! Mind if we share it on our page (with credit, of course)?", ago: 2850 },
      { text: "Of course, go for it!", ago: 2840 },
    ],
  },
  {
    net: "FACEBOOK", kind: "COMMENT", name: "Ben Turner", avatar: 8, post: POSTS.sale, unread: true, labels: ["pricing"],
    messages: [{ text: "Do you have a discount code for first-time customers?", ago: 35 }],
  },
  {
    net: "INSTAGRAM", kind: "DM", name: "Chloé Dubois", handle: "chloe.dbs", avatar: 38,
    messages: [
      { text: "Bonjour! Do you ship to France? I couldn't find it on the website.", ago: 640 },
      { out: true, text: "Bonjour Chloé! We ship across the EU — orders to France usually arrive in 3–5 working days.", ago: 620 },
      { text: "Parfait, merci beaucoup 😊", ago: 615 },
    ],
  },
];

async function demoChannel(brandId: string, network: "FACEBOOK" | "INSTAGRAM", brandName: string) {
  const existing = await prisma.channel.findFirst({
    where: { brandId, network, extras: { path: ["demo"], equals: true } },
    select: { id: true },
  });
  if (existing) {
    await prisma.channel.update({ where: { id: existing.id }, data: { inboxEnabled: true } });
    return existing.id;
  }
  const slug = brandName.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "brand";
  const ch = await prisma.channel.create({
    data: {
      brandId,
      network,
      externalId: `demo-${network.toLowerCase()}-${brandId}`,
      name: network === "FACEBOOK" ? `${brandName}` : `${slug}`,
      username: network === "INSTAGRAM" ? slug : null,
      credentialsEnc: encryptCredentials({}),
      health: "OK",
      extras: { demo: true },
      inboxEnabled: true,
    },
    select: { id: true },
  });
  return ch.id;
}

export const POST = route<Ctx>(async (_req, { params }) => {
  if (process.env.NODE_ENV === "production") throw new HttpError(404, "Not found");
  const { brandId } = await params;
  const { brand, user } = await requireBrand(brandId, "posts.write");

  const channelIds = {
    FACEBOOK: await demoChannel(brandId, "FACEBOOK", brand.name),
    INSTAGRAM: await demoChannel(brandId, "INSTAGRAM", brand.name),
  };
  await prisma.conversation.deleteMany({ where: { brandId, externalId: { startsWith: "demo-" } } });

  const now = Date.now();
  const handleFor = (net: string) => (net === "INSTAGRAM" ? `@${brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}` : `@${brand.name}`);
  let created = 0;
  for (const [i, s] of SAMPLES.entries()) {
    const msgs = s.messages.map((m) => ({ ...m, text: m.text.replace(/@ourbrand/g, handleFor(s.net)) }));
    const last = msgs[msgs.length - 1]!;
    await prisma.conversation.create({
      data: {
        brandId,
        channelId: channelIds[s.net],
        kind: s.kind,
        externalId: `demo-${i}`,
        postExternalId: s.post ? `demo-post-${i}` : null,
        participantName: s.name,
        participantHandle: s.handle ?? null,
        participantAvatar: `https://i.pravatar.cc/150?img=${s.avatar}`,
        status: s.status ?? "OPEN",
        assigneeId: s.assignMe ? user.id : null,
        labels: s.labels ?? [],
        unread: !!s.unread,
        lastMessageAt: new Date(now - last.ago * 60_000),
        lastMessagePreview: last.text.slice(0, 140),
        createdAt: new Date(now - msgs[0]!.ago * 60_000),
        messages: {
          create: msgs.map((m, j) => ({
            direction: m.out ? "OUT" : "IN",
            authorName: m.out ? (user.name ?? brand.name) : s.name,
            text: m.text,
            externalId: `demo-${i}-${j}`,
            sentById: m.out ? user.id : null,
            createdAt: new Date(now - m.ago * 60_000),
            attachments: (j === 0 && s.post ? [{ type: "post_context", text: s.post, url: null }] : []) as Prisma.InputJsonValue,
          })),
        },
      },
    });
    created++;
  }

  if ((await prisma.replySnippet.count({ where: { brandId } })) === 0) {
    await prisma.replySnippet.createMany({
      data: [
        { brandId, title: "Thanks for the love", body: "Thank you so much for the kind words — you've made our day! 💛" },
        { brandId, title: "Order help", body: "Sorry for the trouble! Could you send us your order number in a DM so we can look into it right away?" },
        { brandId, title: "Shipping times", body: "Orders usually ship within 1–2 working days, and you'll get a tracking link by email as soon as yours is on its way." },
        { brandId, title: "Move to DM", body: "Great question! We've sent you a DM with the details." },
      ],
    });
  }
  return { conversations: created, channels: Object.values(channelIds).length };
});

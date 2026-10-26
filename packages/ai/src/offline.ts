// OWNED BY: campaigns/images agent. Deterministic TEMPLATE copywriter used when no ANTHROPIC_API_KEY is configured,
// so campaigns (and, if the lead wires it, single posts) stay demo-able offline. No I/O, no credits.
import type { BrandContext, CampaignGoal, CampaignPlanItem, CampaignRequest, GeneratedPost, GeneratePostRequest, Length, Network, Tone } from "@postline/core";
import { distributeSchedule } from "./prompts";
import { hashString } from "./images";

// ───────────────────────────────────────────── helpers

class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length] as T;
  }
  shuffle<T>(arr: readonly T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
}

const STOP = new Set(
  "a an the and or but for with from into onto about our your their my we you they i me us it its this that these those is are was were be been being to of in on at by as so if then than very just more most new also can will would should could get got make makes made help helps let lets how what why when who which all any some each every out up over under week weeks month months day days post posts campaign campaigns social media create write generate promote promoting announce announcing please want need".split(
    " ",
  ),
);

const LEAD_INS =
  /^(please\s+)?((create|write|generate|make|plan|build|run|draft|design)\s+)?(an?\s+|the\s+|some\s+)?((social\s+media\s+)?(campaign|post|posts|series|content|thread)\s+)?((about|for|on|to|around|promoting|announcing)\s+)?/i;

/** Clean topic phrase from the prompt ("Create a campaign about X" → "X"). */
export function topicFromPrompt(prompt: string): string {
  const first = (prompt.split(/[.!?\n]/)[0] ?? prompt).trim();
  let t = first
    .replace(LEAD_INS, "")
    .replace(/^(the\s+)?(launch|launching|release|introduction|opening|announcement)\s+of\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length < 3) t = first;
  if (t.length > 90) t = `${t.slice(0, 90).replace(/\s+\S*$/, "")}`;
  return t.replace(/[,;:\-–—\s]+$/, "");
}

export function keywords(text: string, max = 4): string[] {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []) {
    const w = raw.replace(/'s$/, "");
    if (w.length < 4 || STOP.has(w) || /^\d+$/.test(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, max).map(([w]) => w);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const tagify = (w: string) => `#${w.split(/[-\s]+/).map(cap).join("").replace(/[^\p{L}\p{N}]/gu, "")}`;

function hashtagsFor(brand: BrandContext, topic: string, goal: CampaignGoal | null, library?: string[]): string[] {
  if (library?.length) return library.slice(0, 5).map((t) => (t.startsWith("#") ? t : `#${t}`));
  const tags = keywords(topic, 3).map(tagify);
  const brandTag = tagify(brand.name);
  if (brandTag.length > 2 && brandTag.length <= 24) tags.push(brandTag);
  const goalTags: Record<CampaignGoal, string> = {
    awareness: "#BehindTheBrand",
    leads: "#GrowthTips",
    launch: "#NewRelease",
    offer: "#LimitedOffer",
    education: "#LearnSomethingNew",
    event: "#SaveTheDate",
  };
  if (goal) tags.push(goalTags[goal]);
  return [...new Set(tags)].slice(0, 5);
}

// ───────────────────────────────────────────── copy banks

const AUDIENCE_PHRASE: Record<string, string> = {
  "business owners": "business owners",
  "founders/executives": "founders and leaders",
  "marketing teams": "marketing teams",
  "buyers/customers": "shoppers",
  "local community": "our neighbours",
  investors: "investors",
  "first-time buyers": "first-time buyers",
  "existing customers": "our customers",
};

function audiencePhrase(a?: string | null): string {
  if (!a) return "you";
  const key = a.trim().toLowerCase();
  return AUDIENCE_PHRASE[key] ?? key.split(/[,/]/)[0]!.trim();
}

/** Campaign angles per goal — a narrative arc, in order. */
const ANGLES: Record<CampaignGoal, string[]> = {
  awareness: ["Origin story", "The problem we care about", "How it works", "Behind the scenes", "A day in the life", "Myth vs. reality", "What makes us different", "Values in action", "Quick tip", "Community spotlight", "By the numbers you can check", "Ask us anything"],
  leads: ["The costly problem", "Why the usual fix fails", "A better approach", "Quick win checklist", "Common mistakes", "Before and after", "Frequently asked question", "Free resource invite", "Who it is for", "What to expect when you reach out", "Objection, answered", "Last call to talk"],
  launch: ["Teaser", "Countdown: why we built it", "Launch day announcement", "What it does", "Who it is for", "Feature deep-dive", "Behind the build", "How to get started", "Questions we keep hearing", "First impressions", "Pro tip", "Launch week recap"],
  offer: ["Offer announcement", "Why now", "What is included", "Who benefits most", "How to claim it", "The value, broken down", "Common questions", "Behind the offer", "Reminder", "Final call"],
  education: ["The big idea", "Step 1: the foundation", "Step 2: putting it into practice", "Step 3: leveling up", "Common mistake to avoid", "Myth vs. fact", "Quick checklist", "Real-world example", "Tool kit", "Q&A", "Recap: key takeaways", "Your next step"],
  event: ["Save the date", "Why attend", "What you will learn", "Meet the hosts", "Agenda highlights", "Who should come", "Behind the scenes prep", "How to join", "Reminder: almost here", "Today is the day", "Thank you and recap", "What comes next"],
};

type Ctx = { topic: string; brand: string; aud: string; tone: Tone; rng: Rng };

const HOOKS: Record<string, ((c: Ctx) => string)[]> = {
  default: [
    (c) => `Let's talk about ${lowerFirst(c.topic)}.`,
    (c) => `${cap(c.aud)}, this one is for you: ${lowerFirst(c.topic)}.`,
    (c) => `Here's something we've been wanting to share: ${lowerFirst(c.topic)}.`,
    (c) => `If ${lowerFirst(c.topic)} is on your mind, read on.`,
  ],
  "Origin story": [(c) => `Every idea starts somewhere. Ours started with ${lowerFirst(c.topic)}.`],
  "The problem we care about": [(c) => `Most ${c.aud} hit the same wall. Here's why ${lowerFirst(c.topic)} matters.`],
  "The costly problem": [(c) => `What is it really costing ${c.aud} to ignore ${lowerFirst(c.topic)}?`],
  "Why the usual fix fails": [(c) => `The usual approach to ${lowerFirst(c.topic)}? It rarely sticks. Here's why.`],
  "Behind the scenes": [(c) => `A peek behind the curtain at ${c.brand} 👀`],
  "Behind the build": [(c) => `How we built it — the honest version.`],
  "Behind the scenes prep": [(c) => `Prep mode: on. Here's what's happening behind the scenes.`],
  "Myth vs. reality": [(c) => `Myth: ${lowerFirst(c.topic)} is complicated. Reality? Not with the right approach.`],
  "Myth vs. fact": [(c) => `Myth vs. fact: what people get wrong about ${lowerFirst(c.topic)}.`],
  Teaser: [(c) => `Something new is coming from ${c.brand}. Can you guess what it is? 👀`],
  "Countdown: why we built it": [(c) => `A few days to go. First, the why behind ${lowerFirst(c.topic)}.`],
  "Launch day announcement": [(c) => `It's here. Introducing ${lowerFirst(c.topic)} 🚀`],
  "Offer announcement": [(c) => `Good news for ${c.aud}: ${lowerFirst(c.topic)}.`],
  "Why now": [(c) => `Why this is the right moment for ${lowerFirst(c.topic)}.`],
  Reminder: [(c) => `Quick reminder: ${lowerFirst(c.topic)} won't be around forever.`],
  "Final call": [(c) => `Last call, ${c.aud}. ⏳`],
  "Last call to talk": [(c) => `Still thinking about ${lowerFirst(c.topic)}? Let's talk.`],
  "Save the date": [(c) => `Save the date 📅 ${cap(c.topic)}.`],
  "Today is the day": [(c) => `Today's the day! ${cap(c.topic)} starts soon.`],
  "Reminder: almost here": [(c) => `Almost here: ${lowerFirst(c.topic)}. Are you in?`],
  "Thank you and recap": [(c) => `Thank you to everyone who joined us for ${lowerFirst(c.topic)} 🙌`],
  "Quick tip": [(c) => `Quick tip for ${c.aud} 💡`],
  "Pro tip": [(c) => `Pro tip from the ${c.brand} team 💡`],
  "Common mistakes": [(c) => `3 mistakes we see ${c.aud} make with ${lowerFirst(c.topic)}.`],
  "Common mistake to avoid": [(c) => `One mistake that quietly holds ${c.aud} back.`],
  "Frequently asked question": [(c) => `"Is ${lowerFirst(c.topic)} right for me?" We hear this a lot.`],
  "Questions we keep hearing": [(c) => `Your questions, answered 👇`],
  "Common questions": [(c) => `Got questions? Here are the ones we hear most.`],
  "Before and after": [(c) => `Before vs. after ${lowerFirst(c.topic)}.`],
  "The big idea": [(c) => `One idea that changes how you think about ${lowerFirst(c.topic)}.`],
  "Recap: key takeaways": [(c) => `Recap time. Everything we covered about ${lowerFirst(c.topic)}, in one post.`],
  "Community spotlight": [(c) => `Shoutout to the community that makes ${c.brand} what it is 💛`],
  "Ask us anything": [(c) => `Ask us anything about ${lowerFirst(c.topic)} 👇`],
};

const GENERAL_TAKEAWAYS = [
  (c: Ctx) => `Start small: one clear goal beats ten vague ones.`,
  (c: Ctx) => `Focus on what ${c.aud} actually need, not what's trendy.`,
  (c: Ctx) => `Consistency compounds — small steps every week add up.`,
  (c: Ctx) => `Measure what matters, then double down on what works.`,
  (c: Ctx) => `Ask for feedback early — it saves weeks later.`,
  (c: Ctx) => `Done and improving beats perfect and waiting.`,
];

const PRODUCT_TAKEAWAYS = [
  (c: Ctx) => `Designed with real feedback from ${c.aud}.`,
  (c: Ctx) => `Every detail earns its place — nothing you don't need.`,
  (c: Ctx) => `Made to fit into your day, not the other way around.`,
  (c: Ctx) => `Quality you can feel from the first use.`,
  (c: Ctx) => `Built to last, so you can focus on what matters.`,
  (c: Ctx) => `Simple to start with, hard to go back from.`,
];

const EVENT_TAKEAWAYS = [
  (c: Ctx) => `Practical sessions you can apply the next day.`,
  (c: Ctx) => `Time to meet people facing the same challenges.`,
  (c: Ctx) => `Real stories, honest answers, no sales pitch.`,
  (c: Ctx) => `Bring your questions — there's time for all of them.`,
];

const TAKEAWAYS_BY_GOAL: Record<CampaignGoal, ((c: Ctx) => string)[]> = {
  awareness: [...GENERAL_TAKEAWAYS, ...PRODUCT_TAKEAWAYS.slice(0, 2)],
  leads: GENERAL_TAKEAWAYS,
  launch: PRODUCT_TAKEAWAYS,
  offer: PRODUCT_TAKEAWAYS,
  education: GENERAL_TAKEAWAYS,
  event: EVENT_TAKEAWAYS,
};

const GENERIC_BODY: Record<CampaignGoal, ((c: Ctx) => string)[]> = {
  awareness: [
    (c) => `At ${c.brand}, ${lowerFirst(c.topic)} isn't a side project — it's the reason we show up every day.`,
    (c) => `We believe ${c.aud} deserve better, and ${lowerFirst(c.topic)} is our way of making that happen.`,
  ],
  leads: [
    (c) => `We've helped ${c.aud} turn ${lowerFirst(c.topic)} from a headache into an advantage, and the first step is easier than you'd think.`,
    (c) => `The difference usually isn't effort — it's having a clear plan for ${lowerFirst(c.topic)}.`,
  ],
  launch: [
    (c) => `We've been working on ${lowerFirst(c.topic)} for a while, and we can't wait for ${c.aud} to try it.`,
    (c) => `Built around one simple idea: make life easier for ${c.aud}.`,
  ],
  offer: [
    (c) => `We wanted to make ${lowerFirst(c.topic)} easier to say yes to — so here it is.`,
    (c) => `It's our way of saying thank you to ${c.aud}.`,
  ],
  education: [
    (c) => `${cap(c.topic)} doesn't have to be overwhelming. Let's break it down.`,
    (c) => `Small, practical steps beat big theories. Here's one you can use today.`,
  ],
  event: [
    (c) => `We're bringing ${c.aud} together for ${lowerFirst(c.topic)} — and you're invited.`,
    (c) => `Expect real conversations, practical takeaways and good company.`,
  ],
};

const BODY: Record<string, (c: Ctx) => string> = {
  "Origin story": (c) => `We kept seeing ${c.aud} struggle with the same thing, so we decided to do something about it. That's how ${c.brand} came to focus on ${lowerFirst(c.topic)}.`,
  "How it works": (c) => `It's simpler than it sounds: understand the goal, pick the right approach, and keep improving as you go. That's the whole idea behind ${lowerFirst(c.topic)}.`,
  "What makes us different": (c) => `We don't do one-size-fits-all. Everything we do around ${lowerFirst(c.topic)} is shaped by real conversations with ${c.aud}.`,
  "Launch day announcement": (c) => `We built this for ${c.aud} who want results without the extra complexity. It's ready for you today.`,
  "What it does": (c) => `In short: it takes something that used to feel like a chore and makes it feel effortless.`,
  "Who it is for": (c) => `Made for ${c.aud} who want to move faster and worry less. If that sounds like you, you're in the right place.`,
  "Who benefits most": (c) => `If you're one of the ${c.aud} who've been waiting for the right moment, this is it.`,
  "Why attend": (c) => `You'll leave with practical ideas, new connections and a clear next step.`,
  "How to join": (c) => `Joining takes less than a minute — details are in the link in our profile.`,
  "How to claim it": (c) => `Claiming it is easy: reach out or visit the link in our profile, and we'll take care of the rest.`,
  "How to get started": (c) => `Getting started takes minutes. Pick one goal, follow the first step, and build from there.`,
  "Free resource invite": (c) => `We put together a practical guide to help ${c.aud} get started. It's yours — just ask.`,
};

const CTAS: Record<CampaignGoal, string[]> = {
  awareness: ["Follow along for more.", "What would you like to see next? Tell us below 👇", "Share this with someone who'd appreciate it.", "Say hi in the comments — we read every one."],
  leads: ["Want to see how this works for you? Send us a message.", "Comment \"INFO\" and we'll reach out.", "Book a quick chat via the link in our profile.", "Ready to talk? Our DMs are open."],
  launch: ["Try it today — link in our profile.", "Turn on notifications so you don't miss it.", "Tell us what you think below 👇", "Be one of the first to try it."],
  offer: ["Claim yours via the link in our profile.", "Don't miss out — details in our profile.", "Questions? Drop them below and we'll answer.", "Tag a friend who needs this."],
  education: ["Save this for later 🔖", "Which tip will you try first? Tell us below.", "Share this with your team.", "Follow for the next lesson."],
  event: ["Reserve your spot — link in our profile.", "Tag who you're bringing 👇", "Add it to your calendar now.", "See you there!"],
};

const EMOJI_TONES: Tone[] = ["friendly", "witty", "inspirational", "bold"];

function stripEmoji(s: string): string {
  return s
    .replace(/[ \t]?[\p{Extended_Pictographic}\u{FE0F}\u{200D}]+/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

const TONE_LEADS: Partial<Record<Tone, string[]>> = {
  witty: ["Plot twist:", "Hot take:", "Not to be dramatic, but"],
  bold: ["No fluff.", "Straight talk:", "Here's the truth."],
  inspirational: ["Big things start small.", "Progress over perfection."],
  educational: ["Quick lesson:", "Here's how it works:"],
};

function compose(opts: {
  brand: BrandContext;
  topic: string;
  angle: string;
  goal: CampaignGoal | null;
  audience?: string | null;
  tone: Tone;
  length: Length;
  seed: number;
}): string {
  const rng = new Rng(opts.seed);
  const c: Ctx = { topic: opts.topic, brand: opts.brand.name, aud: audiencePhrase(opts.audience ?? opts.brand.audience), tone: opts.tone, rng };
  const hookFns = HOOKS[opts.angle] ?? HOOKS.default!;
  let hook = rng.pick(hookFns)(c);
  const lead = TONE_LEADS[opts.tone];
  if (lead && rng.next() < 0.35 && !HOOKS[opts.angle]) hook = `${rng.pick(lead)} ${hook}`;
  const goal = opts.goal ?? "awareness";
  // Pre-launch angles shouldn't tell people to "try it today".
  const ctas = goal === "launch" && /teaser|countdown/i.test(opts.angle) ? ["Turn on notifications so you don't miss it.", "Any guesses? Tell us below 👇", "Stay tuned — it's almost here."] : CTAS[goal];
  const cta = rng.pick(ctas);
  const body = BODY[opts.angle]?.(c) ?? rng.pick(GENERIC_BODY[goal])(c);
  const takeaways = rng.shuffle(TAKEAWAYS_BY_GOAL[goal]).map((t) => t(c));

  const lines: string[] = [hook];
  if (opts.length === "short") {
    lines.push(cta);
  } else if (opts.length === "medium") {
    lines.push(body);
    if (rng.next() < 0.6) lines.push(takeaways[0]!);
    lines.push(cta);
  } else {
    lines.push(body);
    const bullet = EMOJI_TONES.includes(opts.tone) ? "→" : "•";
    lines.push([goal === "launch" || goal === "offer" ? "Why you'll love it:" : goal === "event" ? "What to expect:" : "Here's what we've learned:", ...takeaways.slice(0, 3).map((t) => `${bullet} ${t}`)].join("\n"));
    lines.push(`At ${opts.brand.name}, that's how we approach ${lowerFirst(opts.topic)} every day.`);
    lines.push(cta);
  }
  let text = lines.join("\n\n");
  if (!EMOJI_TONES.includes(opts.tone)) text = stripEmoji(text);
  return text;
}

const X_LIMIT = 280;

function shortVariant(caption: string, hashtags: string[]): string {
  const paras = caption.split("\n\n");
  const short = [paras[0], paras[paras.length - 1]].filter(Boolean).join("\n\n");
  const tags = hashtags.slice(0, 2).join(" ");
  const withTags = tags ? `${short}\n\n${tags}` : short;
  return withTags.length <= X_LIMIT ? withTags : `${short.slice(0, X_LIMIT - 1).replace(/\s+\S*$/, "")}…`;
}

// ───────────────────────────────────────────── public API

/** Single post from templates. `request.prompt` may start with "Angle: …" (campaign regenerate) to steer the angle. */
export function offlinePost(brand: BrandContext, request: GeneratePostRequest & { goal?: CampaignGoal; audience?: string; angle?: string; seed?: number }): GeneratedPost {
  const seed = hashString(`${request.prompt}|${request.tone ?? ""}|${request.length ?? ""}|${request.seed ?? 0}`);
  const angleMatch = /^angle:\s*(.+)$/im.exec(request.prompt);
  const angle = request.angle ?? angleMatch?.[1]?.trim() ?? new Rng(seed).pick(ANGLES[request.goal ?? "awareness"]);
  const promptBody = request.prompt.replace(/^angle:.*$/im, "").trim() || request.prompt;
  const topic = topicFromPrompt(promptBody);
  const caption = compose({
    brand,
    topic,
    angle,
    goal: request.goal ?? null,
    audience: request.audience,
    tone: request.tone ?? "friendly",
    length: request.length ?? "medium",
    seed,
  });
  const hashtags = request.includeHashtags === false ? [] : hashtagsFor(brand, promptBody, request.goal ?? null, request.hashtagLibrary);
  const perNetwork: Partial<Record<Network, string>> = {};
  if (request.networks.includes("X") && caption.length + hashtags.join(" ").length + 2 > X_LIMIT) perNetwork.X = shortVariant(caption, hashtags);
  return { caption, hashtags, perNetwork };
}

/** Whole campaign plan from templates: one distinct angle per post, scheduled like the AI planner. */
export function offlineCampaign(brand: BrandContext, request: CampaignRequest): CampaignPlanItem[] {
  const count = Math.max(1, Math.min(100, Math.floor(request.count)));
  const slots = distributeSchedule(count, Math.max(1, request.durationDays));
  const angles = ANGLES[request.goal] ?? ANGLES.awareness;
  const topic = topicFromPrompt(request.prompt);
  const hashtags = request.includeHashtags === false ? [] : hashtagsFor(brand, request.prompt, request.goal, undefined);
  return slots.map((slot, i) => {
    // spread the narrative arc across the campaign, cycling when there are more posts than angles
    const angle = count <= angles.length ? (angles[Math.round((i * (angles.length - 1)) / Math.max(1, count - 1))] as string) : (angles[i % angles.length] as string);
    const caption = compose({
      brand,
      topic,
      angle,
      goal: request.goal,
      audience: request.audience,
      tone: request.tone ?? "friendly",
      length: request.length ?? "medium",
      seed: hashString(`${request.prompt}|${i}|${angle}`),
    });
    const rot = hashtags.length > 3 ? [...hashtags.slice(i % hashtags.length), ...hashtags.slice(0, i % hashtags.length)] : hashtags;
    return { dayOffset: slot.dayOffset, time: slot.time, angle, caption, hashtags: rot.slice(0, 4) };
  });
}

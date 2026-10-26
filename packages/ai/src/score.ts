// OWNED BY: ai agent. Browser-safe deterministic post score (no SDK / node imports).
import { NETWORK_LIMITS } from "@postline/core";
import type { Network, PostScore, PostScoreCheck, ScoreInput } from "@postline/core";

type CheckId = PostScoreCheck["id"];

/** Weights per check — must sum to 100. */
export const SCORE_WEIGHTS: Record<CheckId, number> = {
  substance: 10,
  hook: 12,
  length_fit: 10,
  takeaway: 12,
  scannable: 8,
  cta: 10,
  media: 10,
  hashtags: 8,
  links: 6,
  readability: 8,
  spam: 6,
};

export const SCORE_LABELS: Record<CheckId, string> = {
  substance: "Has substance",
  hook: "Strong hook",
  length_fit: "Fits every network",
  takeaway: "Specific takeaway",
  scannable: "Easy to scan",
  cta: "Call to action",
  media: "Has media",
  hashtags: "Hashtag count",
  links: "Link placement",
  readability: "Readable sentences",
  spam: "Not spammy",
};

/** Checks an AI "Fix" cannot address. */
export const NON_FIXABLE: ReadonlySet<CheckId> = new Set<CheckId>(["media", "length_fit"]);

/** A check passes when it earns at least this share of its weight. */
export const PASS_RATIO = 0.7;

/** Sensible hashtag ranges per network (min, max). Networks not listed use DEFAULT_HASHTAG_RANGE. */
export const HASHTAG_RANGES: Partial<Record<Network, [number, number]>> = {
  INSTAGRAM: [3, 15],
  X: [0, 3],
  THREADS: [0, 3],
  BLUESKY: [0, 3],
  LINKEDIN: [0, 5],
  LINKEDIN_PAGE: [0, 5],
};
export const DEFAULT_HASHTAG_RANGE: [number, number] = [0, 10];

/** Combined sensible hashtag range for a set of networks (intersection; falls back sanely if empty). */
export function hashtagRange(networks: Network[]): [number, number] {
  if (networks.length === 0) return DEFAULT_HASHTAG_RANGE;
  let lo = 0;
  let hi = Infinity;
  for (const n of networks) {
    const [l, h] = HASHTAG_RANGES[n] ?? DEFAULT_HASHTAG_RANGE;
    lo = Math.max(lo, l);
    hi = Math.min(hi, h);
  }
  if (lo > hi) lo = hi;
  return [lo, hi];
}

export function bandFor(total: number): PostScore["band"] {
  if (total >= 85) return "High";
  if (total >= 70) return "Strong";
  if (total >= 50) return "Fair";
  return "Low";
}

/** Character count the way users perceive it (code points). */
export function charCount(s: string): number {
  return [...s].length;
}

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi;
const HASHTAG_RE = /(^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]+)/gu;
const MENTION_RE = /(^|\s)@[\w.]+/g;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const LIST_LINE_RE = /^\s*(?:[-•*▪►→✅✔☑️🔹🔸👉]|\d{1,2}[.)]|[a-z][.)])\s+/u;

const HOOK_WORDS = [
  "how", "why", "what", "secret", "secrets", "mistake", "mistakes", "stop", "never", "always",
  "you", "your", "free", "new", "best", "worst", "tip", "tips", "lesson", "lessons", "learn",
  "save", "grow", "boost", "faster", "easy", "easier", "simple", "proven", "truth", "nobody",
  "everyone", "finally", "announcing", "introducing", "launch", "launching", "ultimate", "guide",
  "hack", "hacks", "avoid", "unlock", "discover", "imagine", "struggling", "wish", "surprising",
];

const TAKEAWAY_PHRASES = [
  "how to", "step", "steps", "tip", "tips", "lesson", "lessons", "here's", "here is", "here are",
  "guide", "framework", "checklist", "example", "for example", "e.g.", "because", "result",
  "results", "learned", "takeaway", "key", "process", "template", "case study",
];

const CTA_PHRASES = [
  "comment", "share", "save this", "save it", "follow", "click", "tap", "sign up", "signup",
  "join", "try it", "try", "download", "learn more", "read more", "read", "book", "register",
  "subscribe", "dm", "reply", "tell us", "tell me", "let me know", "let us know", "check out",
  "visit", "grab", "get yours", "get started", "shop", "link in bio", "order", "start your",
  "claim", "watch", "listen", "rsvp", "apply", "contact", "drop a", "tag a", "repost",
];

function words(text: string): string[] {
  return text
    .replace(URL_RE, " ")
    .replace(HASHTAG_RE, "$1 ")
    .replace(MENTION_RE, " ")
    .split(/[^\p{L}\p{N}'’-]+/u)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
}

function hasPhrase(text: string, phrases: string[]): boolean {
  const lower = text.toLowerCase();
  return phrases.some((p) => {
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, "u").test(lower);
  });
}

export function countHashtags(caption: string): number {
  return [...caption.matchAll(HASHTAG_RE)].length;
}

export function countLinks(caption: string): number {
  return (caption.match(URL_RE) ?? []).length;
}

function firstLine(caption: string): string {
  return caption.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? "";
}

function sentences(caption: string): string[] {
  return caption
    .replace(URL_RE, " ")
    .split(/[.!?…]+(?:\s|$)|\r?\n+/)
    .map((s) => s.trim())
    .filter((s) => words(s).length > 0);
}

interface CheckResult {
  earned: number;
  suggestion: string;
}

function substanceCheck(caption: string): CheckResult {
  const w = words(caption);
  const letters = w.join("").length;
  const ratio = Math.min(1, letters / 20) * (w.length >= 4 ? 1 : 0.6);
  return {
    earned: SCORE_WEIGHTS.substance * ratio,
    suggestion: "Write at least one complete sentence that says something concrete — the post is too thin right now.",
  };
}

function hookCheck(caption: string): CheckResult {
  const line = firstLine(caption);
  if (!line) return { earned: 0, suggestion: "Open with a short first line that makes people want to read on." };
  const len = charCount(line);
  let earned = 0;
  if (len <= 120) earned += 5;
  else if (len <= 160) earned += 3;
  const lw = words(line).map((x) => x.toLowerCase());
  const signal = line.includes("?") || /\d/.test(line) || lw.some((x) => HOOK_WORDS.includes(x));
  if (signal) earned += 7;
  let suggestion: string;
  if (len > 120 && !signal) suggestion = "Shorten the first line to under 120 characters and lead with a question, a number, or a clear benefit.";
  else if (len > 120) suggestion = `Your first line is ${len} characters — cut it to under 120 so the hook shows before "see more".`;
  else suggestion = "Make the first line more compelling: ask a question, use a specific number, or promise a clear benefit.";
  return { earned, suggestion };
}

function lengthFitCheck(caption: string, networks: Network[]): CheckResult {
  if (networks.length === 0) return { earned: SCORE_WEIGHTS.length_fit, suggestion: "" };
  const len = charCount(caption);
  const over = networks.filter((n) => len > NETWORK_LIMITS[n].caption);
  if (over.length === 0) return { earned: SCORE_WEIGHTS.length_fit, suggestion: "" };
  const threadable = over.every((n) => {
    const hard = NETWORK_LIMITS[n].captionHard;
    return hard !== undefined && len <= hard;
  });
  const tightest = Math.min(...over.map((n) => NETWORK_LIMITS[n].caption));
  if (threadable) {
    return {
      earned: 6,
      suggestion: `At ${len} characters this will be split into a thread on ${over.join(", ")}. Trim to ${tightest} characters (or add a per-network version) to keep it as one post.`,
    };
  }
  return {
    earned: 0,
    suggestion: `The caption is ${len} characters, over the ${tightest}-character limit for ${over.join(", ")}. Shorten it or write a per-network version.`,
  };
}

function takeawayCheck(caption: string): CheckResult {
  const w = words(caption);
  let earned = 0;
  if (/\d/.test(caption.replace(URL_RE, ""))) earned += 3;
  if (hasPhrase(caption, TAKEAWAY_PHRASES)) earned += 3;
  const lines = caption.split(/\r?\n/);
  if (lines.filter((l) => LIST_LINE_RE.test(l)).length >= 2) earned += 3;
  const longWords = new Set(w.filter((x) => x.length >= 7).map((x) => x.toLowerCase()));
  const properNouns = w.filter((x, i) => i > 0 && /^\p{Lu}\p{Ll}+/u.test(x)).length;
  if (longWords.size >= 3 || properNouns >= 2) earned += 3;
  return {
    earned: Math.min(SCORE_WEIGHTS.takeaway, earned),
    suggestion: "Give readers something specific to take away — a number, a concrete example, a how-to step, or a short list.",
  };
}

function scannableCheck(caption: string): CheckResult {
  const len = charCount(caption);
  if (len <= 200) return { earned: SCORE_WEIGHTS.scannable, suggestion: "" };
  let earned = 0;
  if (/\r?\n/.test(caption.trim())) earned += 4;
  const paragraphs = caption.split(/\r?\n\s*\r?\n|\r?\n/).map((p) => p.trim()).filter(Boolean);
  const longest = Math.max(0, ...paragraphs.map(charCount));
  if (longest <= 300) earned += 4;
  else if (longest <= 500) earned += 2;
  return {
    earned,
    suggestion: "Break the caption into short paragraphs (1–3 sentences each) with line breaks so it's easy to skim.",
  };
}

function ctaCheck(caption: string): CheckResult {
  const ok = caption.includes("?") || hasPhrase(caption, CTA_PHRASES);
  return {
    earned: ok ? SCORE_WEIGHTS.cta : 0,
    suggestion: "End with a call to action or a question (e.g. \"What would you add?\" or \"Save this for later\").",
  };
}

function mediaCheck(mediaCount: number, networks: Network[]): CheckResult {
  const required = networks.filter((n) => NETWORK_LIMITS[n].requiresMedia);
  return {
    earned: mediaCount > 0 ? SCORE_WEIGHTS.media : 0,
    suggestion: required.length
      ? `Add an image or video — ${required.join(", ")} require media, and visual posts get far more reach.`
      : "Add an image or video — posts with media get noticeably more engagement.",
  };
}

function hashtagsCheck(caption: string, networks: Network[]): CheckResult {
  const n = countHashtags(caption);
  const [lo, hi] = hashtagRange(networks);
  let earned = 0;
  if (n >= lo && n <= hi) earned = SCORE_WEIGHTS.hashtags;
  else if (n < lo ? lo - n <= 2 : n - hi <= 2) earned = 4;
  const target = lo === hi ? `${lo}` : `${lo}–${hi}`;
  return {
    earned,
    suggestion:
      n > hi
        ? `You have ${n} hashtags — trim to ${target} for these networks; too many looks spammy.`
        : `You have ${n} hashtag${n === 1 ? "" : "s"} — use ${target} relevant hashtags for these networks.`,
  };
}

function linksCheck(caption: string): CheckResult {
  const n = countLinks(caption);
  const inFirst = countLinks(firstLine(caption)) > 0;
  let earned = SCORE_WEIGHTS.links;
  if (n > 1) earned -= 3 * (n - 1);
  if (inFirst) earned -= 3;
  earned = Math.max(0, earned);
  return {
    earned,
    suggestion:
      n > 1
        ? `Use at most one link (you have ${n}), and keep it out of the first line.`
        : "Move the link out of the first line — lead with the hook, put the link near the end.",
  };
}

function readabilityCheck(caption: string): CheckResult {
  const s = sentences(caption);
  if (s.length === 0) return { earned: 0, suggestion: "Write in full, readable sentences." };
  const avg = s.reduce((acc, x) => acc + words(x).length, 0) / s.length;
  let earned = 0;
  if (avg <= 22) earned = 8;
  else if (avg <= 28) earned = 5;
  else if (avg <= 35) earned = 3;
  return {
    earned,
    suggestion: `Sentences average ${Math.round(avg)} words — split long sentences so most stay under 22 words.`,
  };
}

function spamCheck(caption: string): CheckResult {
  const emoji = (caption.match(EMOJI_RE) ?? []).length;
  const bangs = (caption.match(/!/g) ?? []).length;
  const letters = caption.replace(URL_RE, "").replace(HASHTAG_RE, "$1").match(/\p{L}/gu) ?? [];
  const upper = letters.filter((c) => /\p{Lu}/u.test(c)).length;
  const capsRatio = letters.length >= 20 ? upper / letters.length : 0;
  const problems: string[] = [];
  if (emoji > 6) problems.push(`cut emoji to 6 or fewer (you have ${emoji})`);
  if (bangs > 3) problems.push(`use at most 3 exclamation marks (you have ${bangs})`);
  if (capsRatio >= 0.3) problems.push("avoid writing in ALL CAPS");
  return {
    earned: Math.max(0, SCORE_WEIGHTS.spam - 2 * problems.length),
    suggestion: problems.length ? `Tone it down: ${problems.join("; ")}.` : "",
  };
}

/** Build a check from earned points (rounded, clamped). */
export function makeCheck(id: CheckId, earnedRaw: number, suggestion: string): PostScoreCheck {
  const weight = SCORE_WEIGHTS[id];
  const earned = Math.max(0, Math.min(weight, Math.round(earnedRaw)));
  const passed = earned >= weight * PASS_RATIO;
  const check: PostScoreCheck = { id, label: SCORE_LABELS[id], weight, earned, passed, fixable: !NON_FIXABLE.has(id) };
  if (!passed) check.suggestion = suggestion || `Improve "${SCORE_LABELS[id]}".`;
  return check;
}

/** Sum checks into a PostScore. */
export function finalizeScore(checks: PostScoreCheck[]): PostScore {
  const total = Math.max(0, Math.min(100, Math.round(checks.reduce((a, c) => a + c.earned, 0))));
  return { total, band: bandFor(total), checks };
}

export function scorePostHeuristic(input: ScoreInput): PostScore {
  const caption = input.caption ?? "";
  const networks = input.networks ?? [];
  const mediaCount = input.mediaCount ?? 0;
  const empty = caption.trim().length === 0;

  const results: Record<CheckId, CheckResult> = {
    substance: substanceCheck(caption),
    hook: hookCheck(caption),
    length_fit: empty ? { earned: 0, suggestion: "Write a caption first." } : lengthFitCheck(caption, networks),
    takeaway: takeawayCheck(caption),
    scannable: empty ? { earned: 0, suggestion: "Write a caption first." } : scannableCheck(caption),
    cta: ctaCheck(caption),
    media: mediaCheck(mediaCount, networks),
    hashtags: empty ? { earned: 0, suggestion: "Write a caption first." } : hashtagsCheck(caption, networks),
    links: empty ? { earned: 0, suggestion: "Write a caption first." } : linksCheck(caption),
    readability: readabilityCheck(caption),
    spam: empty ? { earned: 0, suggestion: "Write a caption first." } : spamCheck(caption),
  };

  const order = Object.keys(SCORE_WEIGHTS) as CheckId[];
  return finalizeScore(order.map((id) => makeCheck(id, results[id].earned, results[id].suggestion)));
}

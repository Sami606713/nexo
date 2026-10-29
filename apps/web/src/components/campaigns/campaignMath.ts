// Browser-safe campaign constants + schedule math, shared by the composer (client) and the campaigns API (server).
import { CREDIT_COST, type CampaignGoal } from "@postline/core";

export const MAX_CAMPAIGN_POSTS = 30;
export const MAX_CAMPAIGN_DAYS = 90;
export const MAX_IMAGES_PER_POST = 3;

export const GOALS: { value: CampaignGoal; label: string; hint: string }[] = [
  { value: "awareness", label: "Awareness", hint: "Get known, tell the story" },
  { value: "leads", label: "Leads", hint: "Start conversations" },
  { value: "launch", label: "Launch", hint: "Tease, announce, explain" },
  { value: "offer", label: "Offer", hint: "Promote a deal" },
  { value: "education", label: "Education", hint: "Teach step by step" },
  { value: "event", label: "Event", hint: "Fill the room" },
];

export const AUDIENCES = [
  "Business owners",
  "Founders/executives",
  "Marketing teams",
  "Buyers/customers",
  "Local community",
  "Investors",
  "First-time buyers",
  "Existing customers",
] as const;

export const FREQUENCIES = [
  { value: "every2days", label: "Every 2 days", perDay: 0.5 },
  { value: "1", label: "1 per day", perDay: 1 },
  { value: "2", label: "2 per day", perDay: 2 },
  { value: "3", label: "3 per day", perDay: 3 },
  { value: "4", label: "4 per day", perDay: 4 },
] as const;
export type Frequency = (typeof FREQUENCIES)[number]["value"];

/** Inclusive day count between two YYYY-MM-DD dates (calendar days, timezone-free). */
export function daysBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

export function perDayOf(freq: Frequency): number {
  return FREQUENCIES.find((f) => f.value === freq)?.perDay ?? 1;
}

/** Posts in the campaign for a duration + frequency (capped at MAX_CAMPAIGN_POSTS). */
export function campaignPostCount(days: number, freq: Frequency): { count: number; capped: boolean } {
  if (days <= 0) return { count: 0, capped: false };
  const raw = freq === "every2days" ? Math.ceil(days / 2) : days * perDayOf(freq);
  return { count: Math.min(MAX_CAMPAIGN_POSTS, raw), capped: raw > MAX_CAMPAIGN_POSTS };
}

export function campaignCost(count: number, imagesPerPost: number): number {
  return count * (CREDIT_COST.campaign + imagesPerPost * CREDIT_COST.image);
}

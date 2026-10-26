/** Pure workflow helpers (types, schedule due-ness, posting-slot picking). No I/O — unit tested. */
import { addDays, isValidTimeZone, parseTime, tzOffsetMs, zonedTimeToUtc } from "../lib/tz";

export type TriggerType = "schedule" | "rss" | "webhook" | "woo_product" | "new_comment" | "new_mention" | "new_dm";
export type StepType = "ai_agent" | "create_post" | "reply_comment" | "send_dm" | "filter" | "delay";

export interface ScheduleConfig {
  mode?: "interval" | "daily";
  every?: number;
  unit?: "minutes" | "hours" | "days";
  /** HH:mm in brand time zone (mode "daily"). */
  time?: string;
}

export interface WorkflowTrigger {
  type: TriggerType;
  config: Record<string, unknown>;
}

export interface WorkflowStep {
  id: string;
  type: StepType;
  config: Record<string, unknown>;
}

export interface WorkflowState {
  schedule?: { lastFiredAt?: string };
  rss?: { url?: string; initialized?: boolean; seen?: string[]; lastPolledAt?: string; lastError?: string | null };
  woo?: { storeId?: string; initialized?: boolean; seen?: string[]; lastPolledAt?: string; lastError?: string | null };
  [k: string]: unknown;
}

export type StepStatus = "success" | "error" | "skipped" | "filtered" | "waiting";

export interface RunLogEntry {
  stepId: string;
  type: string;
  status: StepStatus;
  output?: Record<string, unknown> | null;
  error?: string | null;
  note?: string | null;
  offline?: boolean;
  startedAt: string;
  finishedAt?: string | null;
}

const UNIT_MS = { minutes: 60_000, hours: 3600_000, days: 86_400_000 } as const;
export const MIN_INTERVAL_MS = 5 * 60_000;
/** Daily triggers fire late (after downtime) only within this window. */
export const DAILY_CATCHUP_MS = 60 * 60_000;

export function intervalMs(cfg: ScheduleConfig): number {
  const every = Math.max(1, Math.floor(Number(cfg.every) || 1));
  return Math.max(MIN_INTERVAL_MS, every * UNIT_MS[cfg.unit ?? "hours"]);
}

/** Wall-clock date (y/m/d) of `at` in time zone `tz`. */
function localDate(at: Date, tz: string) {
  const local = new Date(at.getTime() + tzOffsetMs(tz, at.getTime()));
  return { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1, day: local.getUTCDate() };
}

/**
 * Decide whether a schedule trigger should fire at `now`.
 * - interval: first evaluation only arms the timer (returns "arm"); later fires when `every` has elapsed.
 * - daily: fires once per local day at/after HH:mm (within a 1 h catch-up window).
 */
export function scheduleDecision(
  cfg: ScheduleConfig,
  lastFiredAt: Date | null,
  now: Date,
  timeZone: string,
): "fire" | "arm" | "wait" {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  if ((cfg.mode ?? "interval") === "daily") {
    const t = parseTime(cfg.time ?? "") ?? { hour: 9, minute: 0 };
    const today = localDate(now, tz);
    // Today's occurrence; if it's still in the future, consider yesterday's (for catch-up just after midnight).
    let occ = zonedTimeToUtc({ ...today, ...t }, tz);
    if (occ.getTime() > now.getTime()) occ = zonedTimeToUtc({ ...addDays(today, -1), ...t }, tz);
    if (now.getTime() - occ.getTime() > DAILY_CATCHUP_MS) return "wait";
    if (lastFiredAt && lastFiredAt.getTime() >= occ.getTime()) return "wait";
    return "fire";
  }
  if (!lastFiredAt) return "arm";
  // 30 s slack so a 1-minute ticker doesn't drift a whole tick late.
  return now.getTime() - lastFiredAt.getTime() >= intervalMs(cfg) - 30_000 ? "fire" : "wait";
}

/** Trigger payload of a schedule run. */
export function schedulePayload(now: Date, timeZone: string) {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const d = localDate(now, tz);
  const local = new Date(now.getTime() + tzOffsetMs(tz, now.getTime()));
  const pad = (n: number) => String(n).padStart(2, "0");
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);
  return {
    firedAt: now.toISOString(),
    date: `${d.year}-${pad(d.month)}-${pad(d.day)}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
    weekday,
  };
}

/** Default posting slots when a channel has none: 09:00, 13:00, 18:00 every day. */
export const DEFAULT_SLOT_MINUTES = [9 * 60, 13 * 60, 18 * 60];

/**
 * Earliest slot (weekday 0–6 + minute-of-day in brand tz) at least `leadMs` after `now` that isn't in `occupied`
 * (epoch ms of already-scheduled posts). Searches 21 days ahead; falls back to now + leadMs.
 */
export function nextFreeSlot(
  now: Date,
  timeZone: string,
  slots: Array<{ weekday: number; minute: number }>,
  occupied: Set<number>,
  leadMs = 5 * 60_000,
): Date {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const list = slots.length
    ? slots
    : [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) => DEFAULT_SLOT_MINUTES.map((minute) => ({ weekday, minute })));
  const earliest = now.getTime() + leadMs;
  const start = localDate(now, tz);
  for (let d = 0; d < 21; d++) {
    const day = addDays(start, d);
    const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
    const minutes = [...new Set(list.filter((s) => s.weekday === weekday).map((s) => s.minute))].sort((a, b) => a - b);
    for (const m of minutes) {
      const at = zonedTimeToUtc({ ...day, hour: Math.floor(m / 60), minute: m % 60 }, tz);
      if (at.getTime() < earliest) continue;
      if (occupied.has(at.getTime())) continue;
      return at;
    }
  }
  return new Date(earliest);
}

export function delayMs(cfg: Record<string, unknown>): number {
  const amount = Math.max(1, Math.floor(Number(cfg.amount) || 1));
  const unit = cfg.unit === "hours" ? 3600_000 : cfg.unit === "days" ? 86_400_000 : 60_000;
  return Math.min(amount * unit, 30 * 86_400_000);
}

/** Static sample payloads for "Run now" when no test input is given. */
export function sampleInput(type: TriggerType, now = new Date()): Record<string, unknown> {
  switch (type) {
    case "rss":
      return {
        title: "Five small habits that make remote teams faster",
        link: "https://example.com/blog/remote-habits",
        summary:
          "Async updates, clear owners and a weekly demo day: the routines high-performing distributed teams use to ship more with fewer meetings.",
        guid: "sample-1",
        published: now.toUTCString(),
        image: "",
        author: "Sample author",
        feedTitle: "Sample feed",
      };
    case "woo_product":
      return {
        id: "sample",
        name: "Everyday Canvas Tote",
        permalink: "https://example.com/product/canvas-tote",
        price: "29.00",
        short_description: "A sturdy organic-cotton tote with an inside pocket — built for groceries, books and everything between.",
        images: [],
        image: "",
      };
    case "webhook":
      return { title: "Hello from a webhook", message: "This is a sample webhook payload.", url: "https://example.com" };
    case "new_comment":
      return { text: "Love this! Where can I get the price list?", authorName: "Jamie Rivera", authorHandle: "jamier", channelId: "", conversationId: "", postExternalId: "" };
    case "new_mention":
      return { text: "Big thanks to the team for the quick help today!", authorName: "Sam Lee", authorHandle: "samlee", channelId: "", conversationId: "" };
    case "new_dm":
      return { text: "Hi! Do you ship internationally? I'd like the price list.", authorName: "Alex Kim", authorHandle: "alexk", channelId: "", conversationId: "" };
    default:
      return { firedAt: now.toISOString() };
  }
}

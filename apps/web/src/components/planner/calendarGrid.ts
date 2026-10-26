import { dayjs, type Dayjs } from "@/components/posts/tz";

/** Days to render for a month (6 weeks) or a week, honoring the brand's week start, in `tz`. */
export function gridDays(anchor: string, mode: "month" | "week", tz: string, weekStart: number): Dayjs[] {
  const a = dayjs.tz(`${anchor} 00:00:00`, tz);
  const base = mode === "month" ? a.startOf("month") : a;
  const offset = (base.day() - weekStart + 7) % 7;
  const start = base.subtract(offset, "day").startOf("day");
  const count = mode === "month" ? 42 : 7;
  return Array.from({ length: count }, (_, i) => start.add(i, "day"));
}

export function weekdayLabels(weekStart: number): string[] {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return Array.from({ length: 7 }, (_, i) => names[(weekStart + i) % 7]!);
}

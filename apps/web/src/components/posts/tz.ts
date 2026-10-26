import dayjs, { type Dayjs } from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

export { dayjs };
export type { Dayjs };

/** Wall-clock format used by Mantine 8 date pickers. */
export const PICKER_FORMAT = "YYYY-MM-DD HH:mm:ss";

/** ISO instant → wall-clock string in `tz` (for DateTimePicker value). */
export function isoToPicker(iso: string | null | undefined, tz: string): string | null {
  return iso ? dayjs(iso).tz(tz).format(PICKER_FORMAT) : null;
}

/** Wall-clock string interpreted in `tz` → ISO instant. */
export function pickerToIso(value: string | null | undefined, tz: string): string | null {
  if (!value) return null;
  const d = dayjs.tz(value, tz);
  return d.isValid() ? d.toISOString() : null;
}

/** Now as a wall-clock picker string in `tz`. */
export function nowInTz(tz: string): Dayjs {
  return dayjs().tz(tz);
}

/** Calendar date key YYYY-MM-DD of an instant in `tz`. */
export function dayKey(iso: string, tz: string): string {
  return dayjs(iso).tz(tz).format("YYYY-MM-DD");
}

/** Move an instant to another calendar day in `tz`, keeping its time-of-day. */
export function moveToDay(iso: string, targetDay: string, tz: string): string {
  const t = dayjs(iso).tz(tz).format("HH:mm:ss");
  return dayjs.tz(`${targetDay} ${t}`, tz).toISOString();
}

export function formatTime(iso: string, tz: string) {
  return dayjs(iso).tz(tz).format("h:mm A");
}

export function formatDateTime(iso: string, tz: string) {
  return dayjs(iso).tz(tz).format("ddd, MMM D · h:mm A");
}

/** Suggested "next posting time": next of 09:00 / 12:00 / 17:00 that is ≥ 15 min away, in `tz`. */
export function nextPostingTime(tz: string): string {
  const now = nowInTz(tz);
  const slots = [9, 12, 17];
  for (let day = 0; day < 3; day++) {
    const base = now.add(day, "day").startOf("day");
    for (const h of slots) {
      const cand = base.hour(h);
      if (cand.diff(now, "minute") >= 15) return cand.format(PICKER_FORMAT);
    }
  }
  return now.add(1, "day").hour(9).minute(0).second(0).format(PICKER_FORMAT);
}

export function tomorrowAt(tz: string, hour = 9): string {
  return nowInTz(tz).add(1, "day").startOf("day").hour(hour).format(PICKER_FORMAT);
}

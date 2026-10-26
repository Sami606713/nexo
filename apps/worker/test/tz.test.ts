import { describe, expect, it } from "vitest";
import { addDays, parseDate, parseTime, tzOffsetMs, zonedTimeToUtc } from "../src/lib/tz";

const w = (s: string) => {
  const [d, t] = s.split("T") as [string, string];
  return { ...parseDate(d)!, ...parseTime(t)! };
};

describe("tz", () => {
  it("UTC is identity", () => {
    expect(zonedTimeToUtc(w("2026-03-01T09:00"), "UTC").toISOString()).toBe("2026-03-01T09:00:00.000Z");
  });

  it("fixed offsets east and west", () => {
    expect(zonedTimeToUtc(w("2026-06-15T09:00"), "Asia/Karachi").toISOString()).toBe("2026-06-15T04:00:00.000Z");
    expect(zonedTimeToUtc(w("2026-06-15T09:00"), "Asia/Kolkata").toISOString()).toBe("2026-06-15T03:30:00.000Z");
    expect(zonedTimeToUtc(w("2026-01-15T09:00"), "America/New_York").toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("DST summer vs winter", () => {
    expect(zonedTimeToUtc(w("2026-07-01T09:00"), "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedTimeToUtc(w("2026-07-01T09:00"), "Europe/London").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedTimeToUtc(w("2026-12-01T09:00"), "Europe/London").toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });

  it("days adjacent to DST transitions", () => {
    // US 2026: DST starts Mar 8, ends Nov 1.
    expect(zonedTimeToUtc(w("2026-03-07T09:00"), "America/New_York").toISOString()).toBe("2026-03-07T14:00:00.000Z");
    expect(zonedTimeToUtc(w("2026-03-08T09:00"), "America/New_York").toISOString()).toBe("2026-03-08T13:00:00.000Z");
    expect(zonedTimeToUtc(w("2026-11-01T09:00"), "America/New_York").toISOString()).toBe("2026-11-01T14:00:00.000Z");
    // Just before the spring-forward instant.
    expect(zonedTimeToUtc(w("2026-03-08T01:59"), "America/New_York").toISOString()).toBe("2026-03-08T06:59:00.000Z");
    expect(zonedTimeToUtc(w("2026-03-08T03:00"), "America/New_York").toISOString()).toBe("2026-03-08T07:00:00.000Z");
  });

  it("spring-forward gap shifts forward", () => {
    // 02:30 doesn't exist on 2026-03-08 in New York → 03:30 EDT = 07:30Z
    expect(zonedTimeToUtc(w("2026-03-08T02:30"), "America/New_York").toISOString()).toBe("2026-03-08T07:30:00.000Z");
    // EU: 2026-03-29 02:30 in Berlin doesn't exist → 03:30 CEST = 01:30Z
    expect(zonedTimeToUtc(w("2026-03-29T02:30"), "Europe/Berlin").toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("fall-back ambiguity resolves to the first occurrence", () => {
    // 01:30 occurs twice on 2026-11-01 in New York; first is EDT (05:30Z)
    expect(zonedTimeToUtc(w("2026-11-01T01:30"), "America/New_York").toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("southern hemisphere DST", () => {
    // Sydney: AEDT (+11) in January, AEST (+10) in July
    expect(zonedTimeToUtc(w("2026-01-10T09:00"), "Australia/Sydney").toISOString()).toBe("2026-01-09T22:00:00.000Z");
    expect(zonedTimeToUtc(w("2026-07-10T09:00"), "Australia/Sydney").toISOString()).toBe("2026-07-09T23:00:00.000Z");
  });

  it("unknown zone falls back to UTC", () => {
    expect(zonedTimeToUtc(w("2026-03-01T09:00"), "Not/AZone").toISOString()).toBe("2026-03-01T09:00:00.000Z");
  });

  it("offset helper", () => {
    expect(tzOffsetMs("Asia/Karachi", Date.UTC(2026, 0, 1))).toBe(5 * 3600_000);
    expect(tzOffsetMs("America/New_York", Date.UTC(2026, 6, 1) + 123)).toBe(-4 * 3600_000);
  });

  it("parsers and addDays", () => {
    expect(parseTime("9:05")).toEqual({ hour: 9, minute: 5 });
    expect(parseTime("24:00")).toBeNull();
    expect(parseDate("2026-13-01")).toBeNull();
    expect(addDays({ year: 2026, month: 12, day: 30 }, 3)).toEqual({ year: 2027, month: 1, day: 2 });
    expect(addDays({ year: 2028, month: 2, day: 28 }, 1)).toEqual({ year: 2028, month: 2, day: 29 });
  });
});

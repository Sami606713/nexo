import { describe, expect, it } from "vitest";
import { jobIds } from "@postline/core";
import { campaignItemScheduledAt, decideGroupJob, parsePublishGroupJobId } from "../src/lib/schedule";

describe("campaign scheduling", () => {
  it("startDate + dayOffset + time in brand tz", () => {
    expect(campaignItemScheduledAt("2026-11-02", { dayOffset: 0, time: "09:00" }, "America/New_York").toISOString()).toBe(
      "2026-11-02T14:00:00.000Z",
    );
    expect(campaignItemScheduledAt("2026-11-02", { dayOffset: 3, time: "18:30" }, "Asia/Karachi").toISOString()).toBe(
      "2026-11-05T13:30:00.000Z",
    );
  });

  it("crosses a DST boundary correctly", () => {
    // Start Oct 30 (EDT); offset 3 → Nov 2 (EST)
    expect(campaignItemScheduledAt("2026-10-30", { dayOffset: 0, time: "10:00" }, "America/New_York").toISOString()).toBe(
      "2026-10-30T14:00:00.000Z",
    );
    expect(campaignItemScheduledAt("2026-10-30", { dayOffset: 3, time: "10:00" }, "America/New_York").toISOString()).toBe(
      "2026-11-02T15:00:00.000Z",
    );
  });

  it("crosses month/year", () => {
    expect(campaignItemScheduledAt("2026-12-30", { dayOffset: 5, time: "08:00" }, "UTC").toISOString()).toBe("2027-01-04T08:00:00.000Z");
  });

  it("clamps offset to duration and bad time → 09:00", () => {
    expect(campaignItemScheduledAt("2026-05-01", { dayOffset: 40, time: "nope" }, "UTC", 7).toISOString()).toBe(
      "2026-05-07T09:00:00.000Z",
    );
    expect(campaignItemScheduledAt("2026-05-01", { dayOffset: -2, time: "07:15" }, "UTC").toISOString()).toBe(
      "2026-05-01T07:15:00.000Z",
    );
  });

  it("rejects a bad startDate", () => {
    expect(() => campaignItemScheduledAt("soon", { dayOffset: 0, time: "09:00" }, "UTC")).toThrow();
  });
});

describe("stale publish-group detection", () => {
  const at = new Date("2026-11-01T10:00:00Z");
  const now = at.getTime();
  const id = jobIds.publishGroup("g_1", at.getTime());

  it("parses job ids", () => {
    expect(parsePublishGroupJobId(id)).toEqual({ groupId: "g_1", scheduledAtMs: at.getTime() });
    expect(parsePublishGroupJobId("weird")).toBeNull();
    expect(parsePublishGroupJobId(undefined)).toBeNull();
  });

  it("runs when scheduled and time matches", () => {
    expect(decideGroupJob(id, { status: "SCHEDULED", scheduledAt: at }, now)).toEqual({ run: true });
  });

  it("no-ops after reschedule", () => {
    expect(decideGroupJob(id, { status: "SCHEDULED", scheduledAt: new Date(now + 3600_000) }, now)).toEqual({
      run: false,
      reason: "rescheduled",
    });
  });

  it("no-ops when not SCHEDULED / missing / unscheduled", () => {
    for (const status of ["DRAFT", "PENDING_APPROVAL", "PUBLISHING", "POSTED"]) {
      expect(decideGroupJob(id, { status, scheduledAt: at }, now)).toMatchObject({ run: false, reason: "not_scheduled" });
    }
    expect(decideGroupJob(id, null, now)).toMatchObject({ run: false, reason: "missing" });
    expect(decideGroupJob(id, { status: "SCHEDULED", scheduledAt: null }, now)).toMatchObject({ reason: "no_schedule" });
  });

  it("job without encoded time only runs when due", () => {
    expect(decideGroupJob("123", { status: "SCHEDULED", scheduledAt: at }, now)).toEqual({ run: true });
    expect(decideGroupJob("123", { status: "SCHEDULED", scheduledAt: new Date(now + 10 * 60_000) }, now)).toMatchObject({
      reason: "too_early",
    });
  });
});

describe("job ids (core contract)", () => {
  it("BullMQ-valid: no ':' except the 3-part group id", () => {
    expect(jobIds.publishPost("p1")).toBe("post-p1");
    expect(jobIds.deletePost("p1")).toBe("delete-p1");
    expect(jobIds.publishGroup("g1", 123).split(":")).toHaveLength(3);
  });
});

import { describe, expect, it } from "vitest";
import { getDueCleaningShift } from "../lib/office-cleaning";

describe("office cleaning shifts", () => {
  it("schedules one morning arrival during daylight", () => {
    const date = new Date(2026, 10, 8, 8, 0);

    expect(getDueCleaningShift(date, new Set())).toEqual({
      name: "morning",
      key: "2026-11-8-morning",
    });
    expect(
      getDueCleaningShift(date, new Set(["2026-11-8-morning"])),
    ).toBeNull();
  });

  it("schedules one early-afternoon arrival and never starts at night", () => {
    const afternoon = new Date(2026, 10, 8, 13, 30);
    const lateAfternoon = new Date(2026, 10, 8, 15, 0);
    const night = new Date(2026, 10, 8, 19, 0);

    expect(getDueCleaningShift(afternoon, new Set())?.name).toBe("afternoon");
    expect(getDueCleaningShift(lateAfternoon, new Set())).toBeNull();
    expect(getDueCleaningShift(night, new Set())).toBeNull();
  });

  it("does not start outside the arrival windows", () => {
    expect(getDueCleaningShift(new Date(2026, 10, 8, 7, 59), new Set())).toBeNull();
    expect(getDueCleaningShift(new Date(2026, 10, 8, 11, 0), new Set())).toBeNull();
    expect(getDueCleaningShift(new Date(2026, 10, 8, 16, 0), new Set())).toBeNull();
  });
});

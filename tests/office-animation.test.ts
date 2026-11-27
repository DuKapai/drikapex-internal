import { describe, expect, it } from "vitest";
import {
  clampAnimationDelta,
  dampAngle,
  getFlashIntensity,
} from "../lib/office-animation";

describe("clampAnimationDelta", () => {
  it("limits long frames and ignores invalid or negative elapsed time", () => {
    expect(clampAnimationDelta(0.1)).toBe(0.05);
    expect(clampAnimationDelta(-0.1)).toBe(0);
    expect(clampAnimationDelta(Number.NaN)).toBe(0);
  });
});

describe("dampAngle", () => {
  it("turns along the shortest path across the angle boundary", () => {
    const result = dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 8, 0.05);

    expect(result).toBeGreaterThan(Math.PI - 0.1);
    expect(Math.abs(result)).toBeGreaterThan(Math.PI - 0.1);
  });

  it("produces the same result over equal elapsed time at different frame rates", () => {
    const step = (frameCount: number) => {
      const delta = 1 / frameCount;
      let angle = 0;
      for (let frame = 0; frame < frameCount; frame += 1) {
        angle = dampAngle(angle, 1, 5, delta);
      }
      return angle;
    };

    expect(step(30)).toBeCloseTo(step(60), 10);
  });
});

describe("getFlashIntensity", () => {
  it("alternates adjacent beacons and keeps the configured high-intensity peak", () => {
    expect(getFlashIntensity(0, 0, 12, 0.1)).toBe(12);
    expect(getFlashIntensity(0, 1, 12, 0.1)).toBe(0.1);
    expect(getFlashIntensity(1 / 12, 0, 12, 0.1)).toBe(0.1);
    expect(getFlashIntensity(1 / 12, 1, 12, 0.1)).toBe(12);
  });
});

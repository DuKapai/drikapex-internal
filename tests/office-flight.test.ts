import { describe, expect, it } from "vitest";
import {
  getFlightBoundaryOpacity,
  limitFlightDirectionTurn,
  type FlightDirection,
} from "../lib/office-flight";

const turnLimit = Math.PI / 6;

function angleBetween(left: FlightDirection, right: FlightDirection) {
  const leftLength = Math.hypot(left.x, left.y, left.z);
  const rightLength = Math.hypot(right.x, right.y, right.z);
  const dot =
    (left.x * right.x + left.y * right.y + left.z * right.z) /
    (leftLength * rightLength);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

describe("limitFlightDirectionTurn", () => {
  it("limits random course changes to 30 degrees", () => {
    const previous = { x: 0.3, y: 0.1, z: 0.95 };
    const randomTargets = [
      { x: -0.8, y: 0.5, z: -0.2 },
      { x: 0.1, y: -0.9, z: -0.4 },
      { x: 0.95, y: 0.05, z: -0.3 },
    ];

    for (const target of randomTargets) {
      const next = limitFlightDirectionTurn(previous, target, turnLimit);
      expect(angleBetween(previous, next)).toBeLessThanOrEqual(turnLimit + 1e-8);
    }
  });

  it("keeps a requested course unchanged when it is already within the limit", () => {
    const previous = { x: 0, y: 0, z: 1 };
    const desired = { x: Math.sin(0.2), y: 0, z: Math.cos(0.2) };
    const next = limitFlightDirectionTurn(previous, desired, turnLimit);

    expect(next.x).toBeCloseTo(desired.x);
    expect(next.y).toBeCloseTo(desired.y);
    expect(next.z).toBeCloseTo(desired.z);
  });

  it("handles a direct reversal without producing an invalid direction", () => {
    const next = limitFlightDirectionTurn(
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
      turnLimit,
    );

    expect(Object.values(next).every(Number.isFinite)).toBe(true);
    expect(angleBetween({ x: 0, y: 0, z: 1 }, next)).toBeCloseTo(turnLimit);
  });
});

describe("getFlightBoundaryOpacity", () => {
  const bounds = {
    minX: -10,
    maxX: 10,
    minY: 0,
    maxY: 10,
    minZ: -10,
    maxZ: 10,
  };

  it("keeps birds fully visible away from the scene boundaries", () => {
    expect(
      getFlightBoundaryOpacity({ x: 0, y: 5, z: 0 }, bounds, 4),
    ).toBe(1);
  });

  it("fades birds smoothly as they approach a scene boundary", () => {
    expect(
      getFlightBoundaryOpacity({ x: 5, y: 5, z: 0 }, bounds, 10),
    ).toBeCloseTo(0.5);
    expect(
      getFlightBoundaryOpacity({ x: 10, y: 5, z: 0 }, bounds, 10),
    ).toBe(0);
    expect(
      getFlightBoundaryOpacity({ x: 15, y: 5, z: 0 }, bounds, 10),
    ).toBe(0);
  });
});

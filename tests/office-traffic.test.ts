import { describe, expect, it } from "vitest";
import {
  getInitialTrafficSpawnDelays,
  getMotorcycleManeuver,
  getRightHandLaneOffset,
  getTrafficSpeeds,
  type MotorcycleObstacleState,
} from "../lib/office-traffic";

describe("getRightHandLaneOffset", () => {
  it("places traffic on the right side for both travel directions", () => {
    expect(getRightHandLaneOffset(1, 1.48)).toBe(1.48);
    expect(getRightHandLaneOffset(-1, 1.48)).toBe(-1.48);
  });
});

describe("getMotorcycleManeuver", () => {
  const obstacle = (positionX: number, positionZ: number): MotorcycleObstacleState => ({
    positionX,
    positionZ,
    speed: 2,
    active: true,
  });

  it("changes into a clear adjacent passing lane and returns after overtaking", () => {
    expect(
      getMotorcycleManeuver([obstacle(12, 10)], 0, 10, 1, 0, false),
    ).toEqual({ laneOffset: -1.32, speedFactor: 1 });
    expect(
      getMotorcycleManeuver([obstacle(-4, 10)], 0, 10, 1, -1.32, false),
    ).toEqual({ laneOffset: -1.32, speedFactor: 1 });
    expect(
      getMotorcycleManeuver([obstacle(-7, 10)], 0, 10, 1, -1.32, false),
    ).toEqual({ laneOffset: 0, speedFactor: 1 });
  });

  it("checks safe lane space and slows a regular motorcycle if both sides are blocked", () => {
    const blockingVehicles = [
      obstacle(8, 10),
      obstacle(8, 10 - 1.32),
      obstacle(8, 10 + 1.32),
    ];
    expect(
      getMotorcycleManeuver(blockingVehicles, 0, 10, 1, 0, false),
    ).toEqual({ laneOffset: 0, speedFactor: 0.35 });
  });

  it("uses the sidewalk to pass when police are chasing and road lanes are blocked", () => {
    expect(
      getMotorcycleManeuver(
        [
          obstacle(8, 10),
          obstacle(8, 10 - 1.32),
          obstacle(8, 10 + 1.32),
        ],
        0,
        10,
        1,
        0,
        true,
      ),
    ).toEqual({ laneOffset: 2.55, speedFactor: 1.08 });
  });

  it("treats the shipper as an obstacle and ignores inactive vehicles", () => {
    expect(
      getMotorcycleManeuver(
        [],
        0,
        10,
        1,
        0,
        false,
        obstacle(10, 10),
      ).laneOffset,
    ).toBe(-1.32);
    expect(
      getMotorcycleManeuver(
        [{ ...obstacle(10, 10), active: false }],
        0,
        10,
        1,
        0,
        false,
      ),
    ).toEqual({ laneOffset: 0, speedFactor: 1 });
  });

  it("supports westbound motorcycles without leaving the same road section", () => {
    expect(
      getMotorcycleManeuver([obstacle(-12, 10)], 0, 10, -1, 0, false),
    ).toEqual({ laneOffset: 1.32, speedFactor: 1 });
  });

  it("reuses a supplied result object for per-frame traffic updates", () => {
    const result = { laneOffset: 0, speedFactor: 0 };

    expect(
      getMotorcycleManeuver(
        [obstacle(12, 10)],
        0,
        10,
        1,
        0,
        false,
        undefined,
        result,
      ),
    ).toBe(result);
    expect(result).toEqual({ laneOffset: -1.32, speedFactor: 1 });
  });
});

describe("getInitialTrafficSpawnDelays", () => {
  it("starts each road direction in the opening wave and staggers same-lane traffic", () => {
    const delays = getInitialTrafficSpawnDelays(
      [
        "front-eastbound",
        "front-eastbound",
        "front-westbound",
        "front-westbound",
        "rear-eastbound",
        "rear-westbound",
      ],
      () => 0.5,
    );

    for (const index of [0, 2, 4, 5]) {
      expect(delays[index]).toBeLessThan(2);
    }
    for (const index of [1, 3]) {
      expect(delays[index]).toBeGreaterThanOrEqual(3);
    }
  });

});

describe("getTrafficSpeeds", () => {
  it("reuses the provided result array", () => {
    const speeds = [0];

    expect(
      getTrafficSpeeds(
        [
          {
            laneId: "east",
            progress: 0.1,
            routeLength: 100,
            speed: 5,
            maxSpeed: 5,
          },
        ],
        0.016,
        speeds,
      ),
    ).toBe(speeds);
  });

  it("uses the nearest active slower vehicle in the same lane for braking", () => {
    const speeds = getTrafficSpeeds(
      [
        {
          laneId: "east",
          progress: 0.1,
          routeLength: 100,
          speed: 5,
          maxSpeed: 5,
        },
        {
          laneId: "east",
          progress: 0.16,
          routeLength: 100,
          speed: 2,
          maxSpeed: 2,
        },
        {
          laneId: "east",
          progress: 0.4,
          routeLength: 100,
          speed: 4,
          maxSpeed: 4,
        },
        {
          laneId: "west",
          progress: 0.15,
          routeLength: 100,
          speed: 1,
          maxSpeed: 1,
        },
      ],
      0.1,
    );

    expect(speeds[0]).toBeLessThan(5);
    expect(speeds[2]).toBe(4);
    expect(speeds[3]).toBe(1);
  });
});

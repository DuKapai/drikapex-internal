import { describe, expect, it } from "vitest";
import { getDaylightFactor } from "../lib/office-lighting";
import { getTrafficSpeeds, type TrafficVehicleState } from "../lib/office-traffic";

describe("getDaylightFactor", () => {
  it("tracks local daytime and nighttime", () => {
    expect(getDaylightFactor(new Date(2026, 5, 1, 12))).toBe(1);
    expect(getDaylightFactor(new Date(2026, 5, 1, 0))).toBe(0);
  });

  it("transitions smoothly around sunrise and sunset", () => {
    const sunrise = getDaylightFactor(new Date(2026, 5, 1, 6));
    const midday = getDaylightFactor(new Date(2026, 5, 1, 12));
    const sunset = getDaylightFactor(new Date(2026, 5, 1, 18));
    expect(sunrise).toBeGreaterThan(0);
    expect(sunrise).toBeLessThan(midday);
    expect(sunset).toBeCloseTo(sunrise, 12);
  });
});

describe("getTrafficSpeeds", () => {
  it("slows for the nearest car ahead on its own direction", () => {
    const vehicles: TrafficVehicleState[] = [
      {
        laneId: "eastbound",
        progress: 0.2,
        routeLength: 100,
        speed: 1.6,
        maxSpeed: 1.6,
      },
      {
        laneId: "eastbound",
        progress: 0.205,
        routeLength: 100,
        speed: 0.6,
        maxSpeed: 1.6,
      },
    ];

    expect(getTrafficSpeeds(vehicles, 0.05)[0]).toBeLessThan(1.6);
  });

  it("keeps cars in separate directions independent", () => {
    const vehicles: TrafficVehicleState[] = [
      {
        laneId: "eastbound",
        progress: 0.4,
        routeLength: 100,
        speed: 0.5,
        maxSpeed: 1.6,
      },
      {
        laneId: "westbound",
        progress: 0.405,
        routeLength: 100,
        speed: 0.5,
        maxSpeed: 1.3,
      },
    ];

    expect(getTrafficSpeeds(vehicles, 1)).toEqual([
      expect.closeTo(1.5926, 3),
      expect.closeTo(1.2946, 3),
    ]);
  });

  it("does not mistake a car behind for a lead vehicle on a straight road", () => {
    const vehicles: TrafficVehicleState[] = [
      {
        laneId: "eastbound",
        progress: 0.5,
        routeLength: 100,
        speed: 0.5,
        maxSpeed: 1.6,
      },
      {
        laneId: "eastbound",
        progress: 0.45,
        routeLength: 100,
        speed: 0.5,
        maxSpeed: 1.6,
      },
    ];

    expect(getTrafficSpeeds(vehicles, 1)[0]).toBeCloseTo(1.5926, 3);
  });

  it("ignores vehicles that have exited the road", () => {
    const vehicles: TrafficVehicleState[] = [
      {
        laneId: "eastbound",
        progress: 0.2,
        routeLength: 100,
        speed: 0.5,
        maxSpeed: 1.6,
      },
      {
        laneId: "eastbound",
        progress: 0.205,
        routeLength: 100,
        speed: 0,
        maxSpeed: 1.6,
        active: false,
      },
    ];

    expect(getTrafficSpeeds(vehicles, 1)[0]).toBeCloseTo(1.5926, 3);
  });

  it("maintains safe following distance as faster cars catch up", () => {
    const vehicles: TrafficVehicleState[] = [
      {
        laneId: "eastbound",
        progress: 0.08,
        routeLength: 1000,
        speed: 1.6,
        maxSpeed: 1.6,
      },
      {
        laneId: "eastbound",
        progress: 0.088,
        routeLength: 1000,
        speed: 1.2,
        maxSpeed: 1.2,
      },
    ];
    const delta = 0.05;

    for (let frame = 0; frame < 2400; frame += 1) {
      const speeds = getTrafficSpeeds(vehicles, delta);
      vehicles.forEach((vehicle, index) => {
        vehicle.speed = speeds[index];
        vehicle.progress += (vehicle.speed * delta) / vehicle.routeLength;
      });
      const gap = (vehicles[1].progress - vehicles[0].progress) * 1000;
      expect(gap).toBeGreaterThanOrEqual(3.2);
    }
  });
});

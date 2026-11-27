import { describe, expect, it } from "vitest";
import {
  findCollisionFreePath,
  findCollisionFreePathLeavingObstacle,
  hasMovementProgress,
  findUnblockingPath,
  isOutsideObstacle,
  moveWithCollisions,
  toLocalOfficeObstacle,
} from "../lib/office-motion";

const desk = { minX: 1, maxX: 1.5, minZ: -0.5, maxZ: 0.5 };

describe("toLocalOfficeObstacle", () => {
  it("converts scaled world bounds back to the actor movement coordinate space", () => {
    expect(
      toLocalOfficeObstacle(
        { minX: 0.65, maxX: 1.3, minZ: -0.65, maxZ: 0 },
        0.65,
      ),
    ).toEqual({ minX: 1, maxX: 2, minZ: -1, maxZ: 0 });
  });

  it("keeps door collisions at the visual door instead of its scaled scene position", () => {
    const door = toLocalOfficeObstacle(
      { minX: 2.5, maxX: 3, minZ: -0.5, maxZ: 0.5 },
      0.5,
    );

    expect(moveWithCollisions({ x: 2.5, z: 0 }, { x: 4, z: 0 }, [door]).x)
      .toBeCloseTo(4);
    const stopped = moveWithCollisions(
      { x: 4, z: 0 },
      { x: 7, z: 0 },
      [door],
    );
    expect(stopped.x).toBeGreaterThan(4.6);
    expect(stopped.x).toBeLessThan(4.8);
  });

  it("rejects invalid scene scales", () => {
    expect(() =>
      toLocalOfficeObstacle(desk, 0),
    ).toThrow("Office scale must be a positive finite number.");
  });
});

describe("isOutsideObstacle", () => {
  it("keeps a seated actor's obstacle ignored until their full collision radius clears it", () => {
    expect(
      isOutsideObstacle({ x: 1.5, z: 0.7 }, desk, 0.24),
    ).toBe(false);
    expect(
      isOutsideObstacle({ x: 1.5, z: 0.75 }, desk, 0.24),
    ).toBe(true);
  });

  it("detects when an actor clears the obstacle from any side", () => {
    expect(isOutsideObstacle({ x: 0.7, z: 0 }, desk, 0.24)).toBe(true);
    expect(isOutsideObstacle({ x: 1.2, z: 0 }, desk, 0.24)).toBe(false);
  });
});

describe("hasMovementProgress", () => {
  it("counts movement toward the active waypoint", () => {
    expect(
      hasMovementProgress(
        { x: 0, z: 0 },
        { x: 0.2, z: 0 },
        { x: 1, z: 0 },
        0.1,
      ),
    ).toBe(true);
  });

  it("does not mistake lateral sliding for progress toward the waypoint", () => {
    expect(
      hasMovementProgress(
        { x: 0, z: 0 },
        { x: 0, z: 0.2 },
        { x: 1, z: 0 },
        0.01,
      ),
    ).toBe(false);
  });
});

describe("moveWithCollisions", () => {
  it("stops an actor before a wall or piece of furniture", () => {
    const position = moveWithCollisions({ x: 0, z: 0 }, { x: 2, z: 0 }, [desk]);

    expect(position.x).toBeLessThan(1 - 0.24);
    expect(position.z).toBe(0);
  });

  describe("findCollisionFreePathLeavingObstacle", () => {
    const bounds = { minX: -2, maxX: 5, minZ: -2, maxZ: 5 };
    const chair = { id: "chair", minX: 0, maxX: 1, minZ: 0, maxZ: 1 };

    it("plans a clear exit from the occupied chair before routing to the next spot", () => {
      const start = { x: 0.5, z: 0.5 };
      const goal = { x: 3, z: 0.5 };
      const path = findCollisionFreePathLeavingObstacle(
        start,
        goal,
        [chair],
        { bounds },
        chair.id,
      );

      expect(path?.[0]).toEqual(start);
      expect(path?.at(-1)).toEqual(goal);
      const exitIndex = path?.findIndex((point) =>
        isOutsideObstacle(point, chair),
      );
      expect(exitIndex).toBeGreaterThan(0);
      for (let index = exitIndex! + 1; index < path!.length; index += 1) {
        expect(
          moveWithCollisions(path![index - 1], path![index], [chair]),
        ).toEqual(path![index]);
      }
    });

    it("continues respecting tables and other obstacles after the seat exit", () => {
      const table = { minX: 1.7, maxX: 2.4, minZ: -0.2, maxZ: 1.2 };
      const obstacles = [chair, table];
      const path = findCollisionFreePathLeavingObstacle(
        { x: 0.5, z: 0.5 },
        { x: 3.2, z: 0.5 },
        obstacles,
        { bounds },
        chair.id,
      );

      expect(path).not.toBeNull();
      const exitIndex = path?.findIndex((point) =>
        isOutsideObstacle(point, chair),
      );
      expect(exitIndex).toBeGreaterThan(0);
      for (let index = exitIndex! + 1; index < path!.length; index += 1) {
        expect(
          moveWithCollisions(path![index - 1], path![index], obstacles),
        ).toEqual(path![index]);
      }
    });
  });

  describe("findUnblockingPath", () => {
    it("adds a lateral detour when the direct route is blocked", () => {
      const wall = { minX: 0.35, maxX: 0.55, minZ: -1.5, maxZ: 1.5 };
      const path = findUnblockingPath(
        { x: 0, z: 0 },
        { x: 2, z: 0 },
        [wall],
        {
          bounds: { minX: -3, maxX: 3, minZ: -3, maxZ: 3 },
          radius: 0.24,
        },
      );

      expect(path).not.toBeNull();
      expect(path?.length).toBeGreaterThan(2);
      expect(path?.some((point) => Math.abs(point.z) > 1.7)).toBe(true);
    });

    it("returns null when no alternate route is available", () => {
      const path = findUnblockingPath(
        { x: 0, z: 0 },
        { x: 2, z: 0 },
        [{ minX: -3, maxX: 3, minZ: -3, maxZ: 3 }],
        {
          bounds: { minX: -3, maxX: 3, minZ: -3, maxZ: 3 },
          radius: 0.24,
        },
      );

      expect(path).toBeNull();
    });
  });

  it("routes around an obstacle when the target is beyond its corner", () => {
    const position = moveWithCollisions(
      { x: 0, z: 0 },
      { x: 2, z: 1.8 },
      [desk],
    );

    expect(position.x).toBeCloseTo(2);
    expect(position.z).toBeCloseTo(1.8);
  });

  it("keeps the actor radius clear while sliding beside an obstacle", () => {
    const position = moveWithCollisions(
      { x: 0, z: 0 },
      { x: 0.7, z: 1.5 },
      [desk],
    );

    expect(position.x).toBeCloseTo(0.7);
    expect(position.z).toBeGreaterThan(0.5 + 0.24);
  });

  it("plans a path through a real doorway instead of crossing the wall", () => {
    const walls = [
      { minX: -4, maxX: -0.85, minZ: -0.08, maxZ: 0.08 },
      { minX: 0.85, maxX: 4, minZ: -0.08, maxZ: 0.08 },
    ];
    const path = findCollisionFreePath(
      { x: 0, z: -2 },
      { x: 0, z: 2 },
      walls,
      {
        bounds: { minX: -4, maxX: 4, minZ: -3, maxZ: 3 },
        radius: 0.24,
      },
    );

    expect(path).not.toBeNull();
    expect(path?.every((point) => point.x > -0.61 && point.x < 0.61)).toBe(true);
  });

  it("does not invent a route through a fully blocked wall", () => {
    const path = findCollisionFreePath(
      { x: 0, z: -2 },
      { x: 0, z: 2 },
      [{ minX: -4, maxX: 4, minZ: -0.08, maxZ: 0.08 }],
      {
        bounds: { minX: -4, maxX: 4, minZ: -3, maxZ: 3 },
        radius: 0.24,
      },
    );

    expect(path).toBeNull();
  });

  it("keeps a wider actor footprint clear of obstacles along the planned route", () => {
    const obstacles = [
      { minX: 0.8, maxX: 1.4, minZ: -0.5, maxZ: 0.8 },
      { minX: 1.9, maxX: 2.5, minZ: 0.2, maxZ: 1.5 },
    ];
    const radius = 0.36;
    const path = findCollisionFreePath(
      { x: 0, z: 0 },
      { x: 3, z: 1 },
      obstacles,
      {
        bounds: { minX: -1, maxX: 4, minZ: -2, maxZ: 3 },
        radius,
      },
    );

    expect(path).not.toBeNull();
    for (let index = 1; index < path!.length; index += 1) {
      expect(
        moveWithCollisions(
          path![index - 1],
          path![index],
          obstacles,
          radius,
        ),
      ).toEqual(path![index]);
    }
  });
});

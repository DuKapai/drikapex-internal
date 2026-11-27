export type OfficeObstacle = {
  id?: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type OfficeBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export function toLocalOfficeObstacle(
  obstacle: OfficeObstacle,
  scale: number,
): OfficeObstacle {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError("Office scale must be a positive finite number.");
  }
  return {
    ...obstacle,
    minX: obstacle.minX / scale,
    maxX: obstacle.maxX / scale,
    minZ: obstacle.minZ / scale,
    maxZ: obstacle.maxZ / scale,
  };
}

export function hasMovementProgress(
  from: { x: number; z: number },
  to: { x: number; z: number },
  target: { x: number; z: number },
  minimumProgress = 0,
): boolean {
  const distanceBefore = Math.hypot(target.x - from.x, target.z - from.z);
  const distanceAfter = Math.hypot(target.x - to.x, target.z - to.z);
  return distanceBefore - distanceAfter > minimumProgress;
}

export function isOutsideObstacle(
  position: { x: number; z: number },
  obstacle: OfficeObstacle,
  radius = 0.24,
): boolean {
  return (
    position.x + radius < obstacle.minX ||
    position.x - radius > obstacle.maxX ||
    position.z + radius < obstacle.minZ ||
    position.z - radius > obstacle.maxZ
  );
}

function isBlocked(
  x: number,
  z: number,
  obstacles: readonly OfficeObstacle[],
  radius: number,
): boolean {
  return obstacles.some(
    (obstacle) =>
      x + radius >= obstacle.minX &&
      x - radius <= obstacle.maxX &&
      z + radius >= obstacle.minZ &&
      z - radius <= obstacle.maxZ,
  );
}

export function moveWithCollisions(
  current: { x: number; z: number },
  desired: { x: number; z: number },
  obstacles: readonly OfficeObstacle[],
  radius = 0.24,
): { x: number; z: number } {
  const maxStep = Math.max(radius * 0.5, 0.05);
  const moveAxis = (
    start: number,
    end: number,
    fixed: number,
    axis: "x" | "z",
  ) => {
    let position = start;
    const steps = Math.max(1, Math.ceil(Math.abs(end - start) / maxStep));
    for (let step = 1; step <= steps; step += 1) {
      const next = start + ((end - start) * step) / steps;
      const blocked =
        axis === "x"
          ? isBlocked(next, fixed, obstacles, radius)
          : isBlocked(fixed, next, obstacles, radius);
      if (blocked) break;
      position = next;
    }
    return position;
  };
  const xFirst = {
    x: moveAxis(current.x, desired.x, current.z, "x"),
    z: current.z,
  };
  xFirst.z = moveAxis(current.z, desired.z, xFirst.x, "z");

  const zFirst = {
    x: current.x,
    z: moveAxis(current.z, desired.z, current.x, "z"),
  };
  zFirst.x = moveAxis(current.x, desired.x, zFirst.z, "x");

  const xFirstDistance =
    (desired.x - xFirst.x) ** 2 + (desired.z - xFirst.z) ** 2;
  const zFirstDistance =
    (desired.x - zFirst.x) ** 2 + (desired.z - zFirst.z) ** 2;
  return xFirstDistance <= zFirstDistance ? xFirst : zFirst;
}

export function findCollisionFreePath(
  start: { x: number; z: number },
  goal: { x: number; z: number },
  obstacles: readonly OfficeObstacle[],
  options: {
    bounds: OfficeBounds;
    ignoredObstacleIds?: readonly string[];
    radius?: number;
    cellSize?: number;
  },
): { x: number; z: number }[] | null {
  const cellSize = options.cellSize ?? 0.32;
  const radius = options.radius ?? 0.24;
  const { bounds } = options;
  const ignored = new Set(options.ignoredObstacleIds ?? []);
  const activeObstacles = obstacles.filter(
    (obstacle) => !obstacle.id || !ignored.has(obstacle.id),
  );
  const columns = Math.floor((bounds.maxX - bounds.minX) / cellSize) + 1;
  const rows = Math.floor((bounds.maxZ - bounds.minZ) / cellSize) + 1;
  const total = columns * rows;
  const indexFor = (x: number, z: number) => {
    const column = Math.round((x - bounds.minX) / cellSize);
    const row = Math.round((z - bounds.minZ) / cellSize);
    if (column < 0 || column >= columns || row < 0 || row >= rows) return -1;
    return row * columns + column;
  };
  const positionFor = (index: number) => ({
    x: bounds.minX + (index % columns) * cellSize,
    z: bounds.minZ + Math.floor(index / columns) * cellSize,
  });
  const isFree = (index: number) => {
    if (index < 0) return false;
    const position = positionFor(index);
    return !isBlocked(position.x, position.z, activeObstacles, radius);
  };
  const nearestFree = (position: { x: number; z: number }) => {
    const center = indexFor(position.x, position.z);
    if (center < 0) return -1;
    if (isFree(center)) return center;
    const centerColumn = center % columns;
    const centerRow = Math.floor(center / columns);
    for (let distance = 1; distance <= 8; distance += 1) {
      for (let rowOffset = -distance; rowOffset <= distance; rowOffset += 1) {
        for (const columnOffset of [-distance, distance]) {
          const column = centerColumn + columnOffset;
          const row = centerRow + rowOffset;
          if (column >= 0 && column < columns && row >= 0 && row < rows) {
            const candidate = row * columns + column;
            if (isFree(candidate)) return candidate;
          }
        }
      }
      for (let columnOffset = -distance + 1; columnOffset < distance; columnOffset += 1) {
        for (const rowOffset of [-distance, distance]) {
          const column = centerColumn + columnOffset;
          const row = centerRow + rowOffset;
          if (column >= 0 && column < columns && row >= 0 && row < rows) {
            const candidate = row * columns + column;
            if (isFree(candidate)) return candidate;
          }
        }
      }
    }
    return -1;
  };
  const startIndex = nearestFree(start);
  const goalIndex = nearestFree(goal);
  if (startIndex < 0 || goalIndex < 0) return null;
  if (startIndex === goalIndex) return [goal];

  const previous = new Int32Array(total);
  previous.fill(-2);
  previous[startIndex] = -1;
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  queue[tail++] = startIndex;
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ] as const;

  while (head < tail && previous[goalIndex] === -2) {
    const current = queue[head++];
    const column = current % columns;
    const row = Math.floor(current / columns);
    for (const [dx, dz] of directions) {
      const nextColumn = column + dx;
      const nextRow = row + dz;
      if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) {
        continue;
      }
      const next = nextRow * columns + nextColumn;
      if (previous[next] !== -2 || !isFree(next)) continue;
      if (
        dx !== 0 &&
        dz !== 0 &&
        (!isFree(row * columns + nextColumn) ||
          !isFree(nextRow * columns + column))
      ) {
        continue;
      }
      previous[next] = current;
      queue[tail++] = next;
    }
  }
  if (previous[goalIndex] === -2) return null;

  const path: { x: number; z: number }[] = [];
  for (let index = goalIndex; index !== -1; index = previous[index]) {
    path.push(positionFor(index));
  }
  path.reverse();
  path[0] = start;
  path[path.length - 1] = isBlocked(goal.x, goal.z, activeObstacles, radius)
    ? positionFor(goalIndex)
    : goal;

  const clearSegment = (from: { x: number; z: number }, to: { x: number; z: number }) => {
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(1, Math.ceil(distance / (cellSize / 2)));
    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      if (
        isBlocked(
          from.x + (to.x - from.x) * progress,
          from.z + (to.z - from.z) * progress,
          activeObstacles,
          radius,
        )
      ) {
        return false;
      }
    }
    return true;
  };
  const smoothed = [path[0]];
  let cursor = 0;
  while (cursor < path.length - 1) {
    let next = path.length - 1;
    while (next > cursor + 1 && !clearSegment(path[cursor], path[next])) next -= 1;
    smoothed.push(path[next]);
    cursor = next;
  }
  return smoothed;
}

export function findCollisionFreePathLeavingObstacle(
  start: { x: number; z: number },
  goal: { x: number; z: number },
  obstacles: readonly OfficeObstacle[],
  options: {
    bounds: OfficeBounds;
    ignoredObstacleIds?: readonly string[];
    radius?: number;
    cellSize?: number;
  },
  exitObstacleId?: string,
): { x: number; z: number }[] | null {
  const radius = options.radius ?? 0.24;
  const exitObstacle = obstacles.find(
    (obstacle) => obstacle.id === exitObstacleId,
  );
  if (
    !exitObstacle ||
    exitObstacleId === undefined ||
    isOutsideObstacle(start, exitObstacle, radius) ||
    options.ignoredObstacleIds?.includes(exitObstacleId)
  ) {
    return findCollisionFreePath(start, goal, obstacles, options);
  }

  const margin = radius + 0.12;
  const exits = [
    { x: exitObstacle.minX - margin, z: start.z },
    { x: exitObstacle.maxX + margin, z: start.z },
    { x: start.x, z: exitObstacle.minZ - margin },
    { x: start.x, z: exitObstacle.maxZ + margin },
  ].filter(
    ({ x, z }) =>
      x >= options.bounds.minX &&
      x <= options.bounds.maxX &&
      z >= options.bounds.minZ &&
      z <= options.bounds.maxZ,
  );
  const exitOptions = {
    ...options,
    ignoredObstacleIds: [
      ...(options.ignoredObstacleIds ?? []),
      exitObstacleId,
    ],
  };
  let bestPath: { x: number; z: number }[] | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const exit of exits) {
    const pathToExit = findCollisionFreePath(
      start,
      exit,
      obstacles,
      exitOptions,
    );
    if (!pathToExit) continue;
    const pathToGoal = findCollisionFreePath(
      exit,
      goal,
      obstacles,
      options,
    );
    if (!pathToGoal) continue;
    const path = [...pathToExit, ...pathToGoal.slice(1)];
    let distance = 0;
    for (let index = 1; index < path.length; index += 1) {
      distance += Math.hypot(
        path[index].x - path[index - 1].x,
        path[index].z - path[index - 1].z,
      );
    }
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPath = path;
    }
  }
  return bestPath ?? findCollisionFreePath(start, goal, obstacles, exitOptions);
}

export function findUnblockingPath(
  start: { x: number; z: number },
  goal: { x: number; z: number },
  obstacles: readonly OfficeObstacle[],
  options: {
    bounds: OfficeBounds;
    ignoredObstacleIds?: readonly string[];
    radius?: number;
  },
): { x: number; z: number }[] | null {
  const dx = goal.x - start.x;
  const dz = goal.z - start.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return null;
  const forward = { x: dx / length, z: dz / length };
  const side = { x: -forward.z, z: forward.x };
  const candidates = [
    { ahead: 0.3, sideways: 0.9 },
    { ahead: 0.3, sideways: -0.9 },
    { ahead: 0.9, sideways: 0.78 },
    { ahead: 0.9, sideways: -0.78 },
    { ahead: -0.35, sideways: 0.9 },
    { ahead: -0.35, sideways: -0.9 },
  ];
  let bestPath: { x: number; z: number }[] | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const waypoint = {
      x:
        start.x +
        forward.x * candidate.ahead +
        side.x * candidate.sideways,
      z:
        start.z +
        forward.z * candidate.ahead +
        side.z * candidate.sideways,
    };
    if (
      waypoint.x < options.bounds.minX ||
      waypoint.x > options.bounds.maxX ||
      waypoint.z < options.bounds.minZ ||
      waypoint.z > options.bounds.maxZ
    ) {
      continue;
    }
    const firstLeg = findCollisionFreePath(start, waypoint, obstacles, options);
    if (!firstLeg) continue;
    const secondLeg = findCollisionFreePath(
      waypoint,
      goal,
      obstacles,
      options,
    );
    if (!secondLeg) continue;
    const path = [...firstLeg, ...secondLeg.slice(1)];
    let distance = 0;
    for (let index = 1; index < path.length; index += 1) {
      distance += Math.hypot(
        path[index].x - path[index - 1].x,
        path[index].z - path[index - 1].z,
      );
    }
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPath = path;
    }
  }
  return bestPath;
}

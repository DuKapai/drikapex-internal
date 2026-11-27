export type TrafficVehicleState = {
  laneId: string;
  progress: number;
  routeLength: number;
  speed: number;
  maxSpeed: number;
  positionX?: number;
  positionZ?: number;
  active?: boolean;
};

export type MotorcycleObstacleState = {
  positionX?: number;
  positionZ?: number;
  speed: number;
  active?: boolean;
};

export type MotorcycleManeuver = {
  laneOffset: number;
  speedFactor: number;
};

export const movementSpeedMultiplier = 2;

const minimumVehicleGap = 3.8;
const maximumBraking = 3.2;
const motorcyclePassingOffset = 1.32;
const motorcyclePassingDistance = 18;
const motorcycleMergeDistance = 5.5;

function isActiveObstacle(
  obstacle: MotorcycleObstacleState | undefined,
): obstacle is MotorcycleObstacleState & {
  positionX: number;
  positionZ: number;
} {
  return (
    obstacle?.active !== false &&
    Number.isFinite(obstacle?.positionX) &&
    Number.isFinite(obstacle?.positionZ)
  );
}

function isMotorcycleOffsetClear(
  obstacles: readonly MotorcycleObstacleState[],
  positionX: number,
  laneCenterZ: number,
  offset: number,
  direction: 1 | -1,
  lateralGap: number,
  shipper?: MotorcycleObstacleState,
): boolean {
  const obstacleCount = obstacles.length + (shipper ? 1 : 0);
  for (let index = 0; index < obstacleCount; index += 1) {
    const obstacle = index < obstacles.length ? obstacles[index] : shipper;
    if (!isActiveObstacle(obstacle)) continue;
    const distance = (obstacle.positionX - positionX) * direction;
    if (
      distance >= -4 &&
      distance <= 14 &&
      Math.abs(obstacle.positionZ - (laneCenterZ + offset)) < lateralGap
    ) {
      return false;
    }
  }
  return true;
}

export function getRightHandLaneOffset(
  direction: 1 | -1,
  laneOffset: number,
): number {
  return direction * laneOffset;
}

export function getMotorcycleManeuver(
  obstacles: readonly MotorcycleObstacleState[],
  positionX: number,
  laneCenterZ: number,
  direction: 1 | -1,
  currentOffset: number,
  policeChase: boolean,
  shipper?: MotorcycleObstacleState,
  result: MotorcycleManeuver = { laneOffset: 0, speedFactor: 1 },
): MotorcycleManeuver {
  const obstacleCount = obstacles.length + (shipper ? 1 : 0);
  let closestObstacleDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < obstacleCount; index += 1) {
    const obstacle = index < obstacles.length ? obstacles[index] : shipper;
    if (!isActiveObstacle(obstacle)) continue;
    const distance = (obstacle.positionX - positionX) * direction;
    if (
      distance > 0 &&
      distance <= motorcyclePassingDistance &&
      Math.abs(obstacle.positionZ - (laneCenterZ + currentOffset)) < 1.5
    ) {
      closestObstacleDistance = Math.min(closestObstacleDistance, distance);
    }
  }
  if (!Number.isFinite(closestObstacleDistance)) {
    let justPassed = false;
    for (let index = 0; index < obstacleCount; index += 1) {
      const obstacle = index < obstacles.length ? obstacles[index] : shipper;
      if (!isActiveObstacle(obstacle)) continue;
      const distance = (obstacle.positionX - positionX) * direction;
      justPassed ||= (
        distance < 0 &&
        distance >= -motorcycleMergeDistance &&
        Math.abs(obstacle.positionZ - laneCenterZ) < 1.5
      );
    }
    result.laneOffset =
      justPassed && Math.abs(currentOffset) > 0.3 ? currentOffset : 0;
    result.speedFactor = 1;
    return result;
  }

  const firstOffset =
    Math.abs(currentOffset) > 0.3
      ? Math.sign(currentOffset) *
        Math.min(Math.abs(currentOffset), 2.55)
      : -direction * motorcyclePassingOffset;
  const preferredOffset = -direction * motorcyclePassingOffset;
  const alternateOffset =
    firstOffset === preferredOffset
      ? direction * motorcyclePassingOffset
      : preferredOffset;
  if (
    isMotorcycleOffsetClear(
      obstacles,
      positionX,
      laneCenterZ,
      firstOffset,
      direction,
      1.05,
      shipper,
    )
  ) {
    result.laneOffset = firstOffset;
    result.speedFactor = 1;
    return result;
  }
  if (
    alternateOffset !== firstOffset &&
    isMotorcycleOffsetClear(
      obstacles,
      positionX,
      laneCenterZ,
      alternateOffset,
      direction,
      1.05,
      shipper,
    )
  ) {
    result.laneOffset = alternateOffset;
    result.speedFactor = 1;
    return result;
  }

  const sidewalkOffset = direction * 2.55;
  if (
    policeChase &&
    isMotorcycleOffsetClear(
      obstacles,
      positionX,
      laneCenterZ,
      sidewalkOffset,
      direction,
      0.9,
      shipper,
    )
  ) {
    result.laneOffset = sidewalkOffset;
    result.speedFactor = 1.08;
    return result;
  }
  result.laneOffset = 0;
  result.speedFactor = policeChase ? 0.45 : 0.35;
  return result;
}

export function getInitialTrafficSpawnDelays(
  laneIds: readonly string[],
  random: () => number = Math.random,
): number[] {
  const scheduledLanes = new Set<string>();
  return laneIds.map((laneId) => {
    if (!scheduledLanes.has(laneId)) {
      scheduledLanes.add(laneId);
      return 0.35 + random() * 1.65;
    }
    return 3 + random() * 5;
  });
}

export function getTrafficSpeeds(
  vehicles: readonly TrafficVehicleState[],
  delta: number,
  speeds: number[] = [],
): number[] {
  speeds.length = vehicles.length;
  for (let index = 0; index < vehicles.length; index += 1) {
    const vehicle = vehicles[index];
    let leader: TrafficVehicleState | undefined;
    for (const other of vehicles) {
      if (
        other === vehicle ||
        other.active === false ||
        other.laneId !== vehicle.laneId ||
        other.progress <= vehicle.progress ||
        (leader && other.progress >= leader.progress)
      ) {
        continue;
      }
      leader = other;
    }
    const nearestGap = leader
      ? (leader.progress - vehicle.progress) * vehicle.routeLength
      : Number.POSITIVE_INFINITY;
    const targetSpeed = Number.isFinite(nearestGap)
      ? Math.min(
          vehicle.maxSpeed,
          Math.sqrt(
            Math.max(
              0,
              (leader?.speed ?? 0) ** 2 +
                2 * maximumBraking * (nearestGap - minimumVehicleGap),
            ),
          ),
        )
      : vehicle.maxSpeed;
    const blend = 1 - Math.exp(-5 * Math.max(0, delta));
    speeds[index] = vehicle.speed + (targetSpeed - vehicle.speed) * blend;
  }
  return speeds;
}

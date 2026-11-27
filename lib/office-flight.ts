export type FlightDirection = {
  x: number;
  y: number;
  z: number;
};

export type FlightBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export function getFlightBoundaryOpacity(
  position: FlightDirection,
  bounds: FlightBounds,
  fadeDistance: number,
): number {
  const distanceToBoundary = Math.min(
    position.x - bounds.minX,
    bounds.maxX - position.x,
    position.y - bounds.minY,
    bounds.maxY - position.y,
    position.z - bounds.minZ,
    bounds.maxZ - position.z,
  );
  if (distanceToBoundary <= 0) return 0;
  if (fadeDistance <= 0 || distanceToBoundary >= fadeDistance) return 1;
  const progress = distanceToBoundary / fadeDistance;
  return progress * progress * (3 - 2 * progress);
}

function normalize(direction: FlightDirection): FlightDirection {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length < 1e-8) return { x: 1, y: 0, z: 0 };
  return {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  };
}

export function limitFlightDirectionTurn(
  currentDirection: FlightDirection,
  desiredDirection: FlightDirection,
  maxTurnRadians: number,
): FlightDirection {
  const current = normalize(currentDirection);
  const desired = normalize(desiredDirection);
  const dot = Math.max(
    -1,
    Math.min(
      1,
      current.x * desired.x +
        current.y * desired.y +
        current.z * desired.z,
    ),
  );
  const angle = Math.acos(dot);
  if (angle <= maxTurnRadians) return desired;

  let axis = {
    x: current.y * desired.z - current.z * desired.y,
    y: current.z * desired.x - current.x * desired.z,
    z: current.x * desired.y - current.y * desired.x,
  };
  const axisLength = Math.hypot(axis.x, axis.y, axis.z);
  if (axisLength < 1e-8) {
    const reference = Math.abs(current.y) < 0.9
      ? { x: 0, y: 1, z: 0 }
      : { x: 1, y: 0, z: 0 };
    axis = {
      x: current.y * reference.z - current.z * reference.y,
      y: current.z * reference.x - current.x * reference.z,
      z: current.x * reference.y - current.y * reference.x,
    };
  }
  const unitAxis = normalize(axis);
  const cosine = Math.cos(maxTurnRadians);
  const sine = Math.sin(maxTurnRadians);
  const cross = {
    x: unitAxis.y * current.z - unitAxis.z * current.y,
    y: unitAxis.z * current.x - unitAxis.x * current.z,
    z: unitAxis.x * current.y - unitAxis.y * current.x,
  };
  return normalize({
    x: current.x * cosine + cross.x * sine,
    y: current.y * cosine + cross.y * sine,
    z: current.z * cosine + cross.z * sine,
  });
}

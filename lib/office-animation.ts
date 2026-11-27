const maxAnimationDelta = 0.05;

export function clampAnimationDelta(delta: number): number {
  if (!Number.isFinite(delta) || delta <= 0) return 0;
  return Math.min(delta, maxAnimationDelta);
}

export function getFlashIntensity(
  elapsed: number,
  index: number,
  onIntensity: number,
  offIntensity: number,
  frequency = 12,
): number {
  return Math.floor(elapsed * frequency + index) % 2 === 0
    ? onIntensity
    : offIntensity;
}

export function dampAngle(
  current: number,
  target: number,
  smoothing: number,
  delta: number,
): number {
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(target) ||
    !Number.isFinite(smoothing) ||
    !Number.isFinite(delta) ||
    smoothing <= 0 ||
    delta <= 0
  ) {
    return current;
  }
  const difference = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  return current + difference * (1 - Math.exp(-smoothing * delta));
}

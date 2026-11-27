export function getDaylightFactor(date: Date): number {
  const localHour =
    date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const solarElevation = Math.sin(((localHour - 6) / 12) * Math.PI);
  const progress = Math.min(1, Math.max(0, (solarElevation + 0.1) / 0.3));
  return progress * progress * (3 - 2 * progress);
}

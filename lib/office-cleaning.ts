export type CleaningShiftName = "morning" | "afternoon";

export type CleaningShift = {
  name: CleaningShiftName;
  key: string;
};

const cleaningShiftWindows: Record<
  CleaningShiftName,
  { startHour: number; endHour: number }
> = {
  morning: { startHour: 8, endHour: 11 },
  afternoon: { startHour: 13, endHour: 15 },
};

export function getDueCleaningShift(
  date: Date,
  completedShiftKeys: ReadonlySet<string>,
): CleaningShift | null {
  const hour = date.getHours();
  if (hour < 7 || hour >= 16) return null;

  const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  for (const name of ["morning", "afternoon"] as const) {
    const { startHour, endHour } = cleaningShiftWindows[name];
    if (hour < startHour || hour >= endHour) continue;
    const key = `${dateKey}-${name}`;
    if (!completedShiftKeys.has(key)) return { name, key };
  }

  return null;
}

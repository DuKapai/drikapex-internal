import type { MonthlyTask } from "../supabase/monthly-tasks-api";

export const suggestedTaskGroups = ["CÔNG VIỆC CHUNG", "MINECRAFT/PIKAMC", "WEBSITE/SERVER", "DISCORD BOT"];

export function normalizeTaskGroup(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleUpperCase("vi");
}

export function groupMonthlyTasks(tasks: MonthlyTask[]): { name: string; tasks: MonthlyTask[] }[] {
  const groups = new Map<string, MonthlyTask[]>();
  for (const task of tasks) {
    const name = normalizeTaskGroup(task.group_name);
    const rows = groups.get(name) ?? [];
    rows.push(task);
    groups.set(name, rows);
  }
  return Array.from(groups, ([name, rows]) => ({ name, tasks: rows }));
}

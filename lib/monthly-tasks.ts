import type { MonthlyTask, TaskPerson } from "../supabase/monthly-tasks-api";

export function isCompletedMonthlyTask(status: string | null): boolean {
  return status === "Đã hoàn thành" || status === "Ðã hoàn thành" || status === "Hoàn thành";
}

export function isOutsideReportMonth(date: string | null, month: string): boolean {
  return date !== null && date.slice(0, 7) !== month;
}

export type MonthlyTaskSearchType = "all" | "people" | "task" | "time";
export type MonthlyTaskFilters = {
  search: string;
  searchType: MonthlyTaskSearchType;
  title: string;
  status: string;
  priority: string;
  assignee: string;
  date: string;
  note: string;
};

function normalize(value: string): string {
  return value.toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
}

export function matchesMonthlyTaskFilters(task: MonthlyTask, people: TaskPerson[], filters: MonthlyTaskFilters): boolean {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const names = task.assignee_ids.flatMap((id) => {
    const person = peopleById.get(id);
    return person ? [person.display_name ?? "", person.username ?? ""] : [];
  });
  if (task.source_assignee) names.push(task.source_assignee);
  const date = task.work_date ?? "";
  const formattedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split("-").reverse().join("/") : date;
  const matches = (value: string, query: string) => normalize(value).includes(normalize(query));
  const searchFields = {
    people: names.join(" "),
    task: [task.title, task.group_name, task.status, task.priority, task.note].join(" "),
    time: [date, formattedDate, task.report_month].join(" "),
  };
  const searchValue = filters.searchType === "all" ? Object.values(searchFields).join(" ") : searchFields[filters.searchType];
  const knownAssignees = task.assignee_ids.filter((id) => peopleById.has(id));
  return matches(searchValue, filters.search)
    && matches(task.title, filters.title)
    && (!filters.status || task.status === filters.status ||
      (isCompletedMonthlyTask(filters.status) && isCompletedMonthlyTask(task.status)))
    && (!filters.priority || task.priority === filters.priority)
    && (!filters.assignee || (filters.assignee === "unmatched"
      ? !task.assignee_ids.length || knownAssignees.length !== task.assignee_ids.length
      : task.assignee_ids.includes(filters.assignee)))
    && (!filters.date || date === filters.date)
    && matches(task.note ?? "", filters.note);
}

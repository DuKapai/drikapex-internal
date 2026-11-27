import { getSupabaseClient } from "@/supabase/client";
import { getSafeErrorMessage } from "@/supabase/errors";
import { normalizeTaskGroup } from "../lib/monthly-task-groups";

export type MonthlyTask = {
  id: number;
  report_month: string;
  title: string;
  group_name: string;
  priority: string | null;
  assignee_id: string | null;
  assignee_ids: string[];
  source_assignee: string | null;
  status: string | null;
  work_date: string | null;
  note: string | null;
  source_key: string | null;
};

export type MonthlyTaskInput = Pick<MonthlyTask, "report_month" | "title" | "group_name" | "priority" | "assignee_id" | "status" | "work_date" | "note">;
export type MonthlyTaskField = "title" | "group_name" | "priority" | "status" | "work_date" | "note";
export type TaskPerson = { id: string; display_name: string | null; username: string | null };
export type MonthlyTaskLoad = { rows: MonthlyTask[]; teamAssignmentsAvailable: boolean };
export type MonthlyTaskLockStatus = { locked: boolean; can_manage: boolean; past_month: boolean };

function failure(error: unknown): Error {
  if (typeof error === "object" && error !== null && "message" in error &&
    error.message === "This report month is locked") {
    return new Error("Tháng báo cáo đã bị khóa. Owner cần mở khóa trước khi sửa.");
  }
  return new Error(getSafeErrorMessage(error));
}

export async function loadMonthlyTaskLock(month: string): Promise<MonthlyTaskLockStatus> {
  const { data, error } = await getSupabaseClient().rpc("monthly_task_lock_status", { p_month: `${month}-01` });
  if (error) throw failure(error);
  const status: unknown = Array.isArray(data) ? data[0] : null;
  if (typeof status !== "object" || status === null ||
    !("locked" in status) || typeof status.locked !== "boolean" ||
    !("can_manage" in status) || typeof status.can_manage !== "boolean" ||
    !("past_month" in status) || typeof status.past_month !== "boolean") {
    throw new Error("Trạng thái khóa tháng không hợp lệ.");
  }
  return { locked: status.locked, can_manage: status.can_manage, past_month: status.past_month };
}

export async function setMonthlyTaskLock(month: string, locked: boolean): Promise<void> {
  const { error } = await getSupabaseClient().rpc("set_monthly_task_lock", {
    p_month: `${month}-01`, p_locked: locked,
  });
  if (error) throw failure(error);
}

function isMissingAssigneeTable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? error.code : undefined;
  return code === "42P01" || code === "PGRST205";
}

export async function loadMonthlyTasks(month: string): Promise<MonthlyTaskLoad> {
  const rows: MonthlyTask[] = [];
  const pageSize = 1000;
  let teamAssignmentsAvailable = true;
  for (let offset = 0; ; offset += pageSize) {
    const client = getSupabaseClient();
    const { data, error } = await client.from("monthly_tasks")
      .select("id,report_month,title,group_name,priority,assignee_id,source_assignee,status,work_date,note,source_key")
      .eq("report_month", `${month}-01`).order("work_date", { ascending: true, nullsFirst: false })
      .order("id").range(offset, offset + pageSize - 1);
    if (error) throw failure(error);
    if (teamAssignmentsAvailable && !data.length) {
      const { error: schemaError } = await client.from("monthly_task_assignees")
        .select("task_id,user_id").limit(0);
      if (schemaError) {
        if (isMissingAssigneeTable(schemaError)) teamAssignmentsAvailable = false;
        else throw failure(schemaError);
      }
    }
    if (data.length) {
      const assignmentsByTask = new Map<number, string[]>();
      if (teamAssignmentsAvailable) {
        const { data: assignments, error: assignmentError } = await client.from("monthly_task_assignees")
          .select("task_id,user_id").in("task_id", data.map((row) => row.id));
        if (assignmentError) {
          if (isMissingAssigneeTable(assignmentError)) {
            teamAssignmentsAvailable = false;
          } else {
            throw failure(assignmentError);
          }
        } else {
          for (const assignment of assignments ?? []) {
            const ids = assignmentsByTask.get(assignment.task_id) ?? [];
            ids.push(assignment.user_id);
            assignmentsByTask.set(assignment.task_id, ids);
          }
        }
      }
      rows.push(...data.map((row) => ({
        ...row,
        assignee_ids: assignmentsByTask.get(row.id) ??
          (row.assignee_id ? [row.assignee_id] : []),
      })));
    }
    if (data.length < pageSize) return { rows, teamAssignmentsAvailable };
  }
}

export async function loadTaskPeople(): Promise<TaskPerson[]> {
  const { data, error } = await getSupabaseClient().rpc("list_monthly_task_people");
  if (error) throw failure(error);
  if (!Array.isArray(data) || !data.every((person) =>
    typeof person === "object" && person !== null && typeof person.id === "string" &&
    (person.display_name === null || typeof person.display_name === "string") &&
    (person.username === null || typeof person.username === "string"))) {
    throw new Error("Danh sách nhân sự không hợp lệ.");
  }
  return data;
}

export async function saveMonthlyTask(id: number | null, input: MonthlyTaskInput, assigneeIds?: string[]): Promise<void> {
  if (id !== null) throw new Error("Chỉnh sửa công việc cần cập nhật theo từng trường.");
  const task = input;
  const { error } = await getSupabaseClient().rpc("create_grouped_monthly_task", {
    p_report_month: task.report_month,
    p_title: task.title,
    p_group_name: normalizeTaskGroup(task.group_name),
    p_priority: task.priority,
    p_status: task.status,
    p_work_date: task.work_date,
    p_note: task.note,
    p_assignee_ids: assigneeIds ?? (input.assignee_id ? [input.assignee_id] : []),
  });
  if (error) throw failure(error);
}

export async function saveMonthlyTaskAssignees(id: number, userIds: string[], expectedUserIds: string[]): Promise<void> {
  const { error } = await getSupabaseClient().rpc("set_monthly_task_assignees", {
    p_task_id: id,
    p_assignee_ids: userIds,
    p_expected_assignee_ids: expectedUserIds,
  });
  if (error) throw failure(error);
}

export async function updateMonthlyTaskField(
  id: number, field: MonthlyTaskField, previous: string | null, value: string | null,
): Promise<void> {
  let query = getSupabaseClient().from("monthly_tasks").update({ [field]: value }).eq("id", id);
  query = previous === null ? query.is(field, null) : query.eq(field, previous);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw failure(error);
  if (!data) throw new Error("Công việc đã thay đổi hoặc bạn không còn quyền sửa. Hãy tải lại trước khi thử lại.");
}

export async function deleteMonthlyTask(id: number): Promise<void> {
  const { error } = await getSupabaseClient().from("monthly_tasks").delete().eq("id", id).select("id").single();
  if (error) throw failure(error);
}

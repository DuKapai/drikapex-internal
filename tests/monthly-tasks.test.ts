import { describe, expect, it } from "vitest";
import { isCompletedMonthlyTask, isOutsideReportMonth, matchesMonthlyTaskFilters, type MonthlyTaskFilters } from "../lib/monthly-tasks";
import type { MonthlyTask, TaskPerson } from "../supabase/monthly-tasks-api";
import { groupMonthlyTasks } from "../lib/monthly-task-groups";

describe("monthly task summaries", () => {
  it("counts source and current spellings of completed status without changing the saved value", () => {
    expect(isCompletedMonthlyTask("Ðã hoàn thành")).toBe(true);
    expect(isCompletedMonthlyTask("Đã hoàn thành")).toBe(true);
    expect(isCompletedMonthlyTask("Hoàn thành")).toBe(true);
    expect(isCompletedMonthlyTask("Cần làm lại")).toBe(false);
    expect(isCompletedMonthlyTask(null)).toBe(false);
  });

  describe("monthly task filters", () => {
    const task: MonthlyTask = {
      id: 1, report_month: "2026-03-01", title: "Lập báo cáo", priority: "1",
      group_name: "CÔNG VIỆC CHUNG",
      assignee_id: "one", assignee_ids: ["one", "two"], source_assignee: null,
      status: "Đang thực hiện", work_date: "2026-03-14", note: "Gửi khách hàng", source_key: null,
    };
    const people: TaskPerson[] = [
      { id: "one", display_name: "Nguyễn An", username: "an" },
      { id: "two", display_name: "Trần Bình", username: "binh" },
    ];
    const defaults: MonthlyTaskFilters = { search: "", searchType: "all", title: "", status: "", priority: "", assignee: "", date: "", note: "" };
    const match = (filters: Partial<MonthlyTaskFilters>, row = task, roster = people) =>
      matchesMonthlyTaskFilters(row, roster, { ...defaults, ...filters });

    it("searches all assigned people and respects the selected search type", () => {
      expect(match({ search: "tran binh", searchType: "people" })).toBe(true);
      expect(match({ search: "binh", searchType: "task" })).toBe(false);
      expect(match({ search: "bao cao", searchType: "all" })).toBe(true);
      expect(match({ search: "14/03/2026", searchType: "time" })).toBe(true);
      expect(match({ search: "2026-03", searchType: "time" })).toBe(true);
      expect(match({ search: "cong viec chung", searchType: "task" })).toBe(true);
    });

    it("groups saved tasks without duplicating case or whitespace variants", () => {
      const rows = [
        { ...task, id: 1, group_name: "minecraft/pikamc" },
        { ...task, id: 2, group_name: " WEBSITE/SERVER " },
        { ...task, id: 3, group_name: " MINECRAFT/PIKAMC " },
        { ...task, id: 4, group_name: "Nội   dung mới" },
        { ...task, id: 5, group_name: "Nội dung mới".normalize("NFD") },
      ];
      expect(groupMonthlyTasks(rows).map((group) => [group.name, group.tasks.map((row) => row.id)]))
        .toEqual([["MINECRAFT/PIKAMC", [1, 3]], ["WEBSITE/SERVER", [2]], ["NỘI DUNG MỚI", [4, 5]]]);
      expect(groupMonthlyTasks([])).toEqual([]);
    });

    it("combines field filters and supports secondary or unmatched assignees", () => {
      expect(match({ title: "bao cao", status: "Đang thực hiện", priority: "1", assignee: "two", date: "2026-03-14", note: "khach hang" })).toBe(true);
      expect(match({ assignee: "two", date: "2026-03-15" })).toBe(false);
      expect(match({ assignee: "unmatched" }, { ...task, assignee_ids: [], source_assignee: "Nhân sự cũ" })).toBe(true);
      expect(match({ search: "nhan su cu", searchType: "people" }, { ...task, assignee_ids: [], source_assignee: "Nhân sự cũ" })).toBe(true);
      expect(match({ assignee: "unmatched" })).toBe(false);
    });

    it("includes imported spellings when filtering completed tasks", () => {
      expect(match({ status: "Đã hoàn thành" }, { ...task, status: "Ðã hoàn thành" })).toBe(true);
      expect(match({ status: "Đã hoàn thành" }, { ...task, status: "Hoàn thành" })).toBe(true);
      expect(match({ status: "Đã hoàn thành" })).toBe(false);
    });
  });

  it("flags a work date outside the report tab's month but not a missing date", () => {
    expect(isOutsideReportMonth("2026-05-03", "2026-03")).toBe(true);
    expect(isOutsideReportMonth("2026-03-14", "2026-03")).toBe(false);
    expect(isOutsideReportMonth(null, "2026-03")).toBe(false);
  });
});

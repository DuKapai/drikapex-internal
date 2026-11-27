import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/supabase/client", () => ({
  getSupabaseClient: () => ({ from: mocks.from }),
}));
vi.mock("@/supabase/errors", () => ({
  getSafeErrorMessage: () => "Không thể tải công việc.",
}));

import { loadMonthlyTasks } from "../supabase/monthly-tasks-api";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("monthly task loading", () => {
  it("keeps legacy tasks visible when the team-assignment table is not installed", async () => {
    const task = {
      id: 8,
      report_month: "2026-11-01",
      title: "Existing work",
      group_name: "CÔNG VIỆC CHUNG",
      priority: null,
      assignee_id: "employee-1",
      source_assignee: null,
      status: "Đang thực hiện",
      work_date: null,
      note: null,
      source_key: null,
    };
    const taskQuery = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() };
    taskQuery.select.mockReturnValue(taskQuery);
    taskQuery.eq.mockReturnValue(taskQuery);
    taskQuery.order.mockReturnValue(taskQuery);
    taskQuery.range.mockResolvedValue({ data: [task], error: null });

    const assignmentQuery = { select: vi.fn(), in: vi.fn(), limit: vi.fn() };
    assignmentQuery.select.mockReturnValue(assignmentQuery);
    assignmentQuery.in.mockResolvedValue({ data: null, error: { code: "PGRST205" } });

    mocks.from.mockImplementation((table: string) =>
      table === "monthly_tasks" ? taskQuery : assignmentQuery,
    );

    await expect(loadMonthlyTasks("2026-11")).resolves.toEqual({
      rows: [{ ...task, assignee_ids: ["employee-1"] }],
      teamAssignmentsAvailable: false,
    });
  });
});

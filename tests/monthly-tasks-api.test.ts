import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => ({
  update: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/supabase/client", () => ({
  getSupabaseClient: () => ({ from: () => query, rpc: query.rpc }),
}));
vi.mock("@/supabase/errors", () => ({
  getSafeErrorMessage: () => "Không thể lưu công việc.",
}));

import { saveMonthlyTask, updateMonthlyTaskField } from "../supabase/monthly-tasks-api";

beforeEach(() => {
  vi.clearAllMocks();
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: { id: 5 }, error: null });
  query.rpc.mockResolvedValue({ data: 5, error: null });
});

describe("monthly task cell updates", () => {
  it("writes only the edited field and compares the original value", async () => {
    await updateMonthlyTaskField(5, "note", "old", "new");
    expect(query.update).toHaveBeenCalledWith({ note: "new" });
    expect(query.eq.mock.calls).toEqual([["id", 5], ["note", "old"]]);
  });

  it("compares null correctly and reports conflicts instead of silently overwriting", async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(updateMonthlyTaskField(5, "status", null, "Đang thực hiện"))
      .rejects.toThrow("đã thay đổi");
    expect(query.is).toHaveBeenCalledWith("status", null);
  });

  it("creates a task and its selected group through one atomic RPC", async () => {
    await saveMonthlyTask(null, {
      report_month: "2026-11-01", title: "Test", group_name: " website/server ",
      priority: null, assignee_id: "one", status: null, work_date: null, note: null,
    }, ["one", "two"]);
    expect(query.rpc).toHaveBeenCalledWith("create_grouped_monthly_task", expect.objectContaining({
      p_group_name: "WEBSITE/SERVER", p_assignee_ids: ["one", "two"], p_report_month: "2026-11-01",
    }));
    expect(query.update).not.toHaveBeenCalled();
  });

  it("does not overwrite a group changed by another session", async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(updateMonthlyTaskField(5, "group_name", "CÔNG VIỆC CHUNG", "WEBSITE/SERVER"))
      .rejects.toThrow("đã thay đổi");
    expect(query.eq).toHaveBeenCalledWith("group_name", "CÔNG VIỆC CHUNG");
  });

  it("saves a group change to the matching Supabase task", async () => {
    await updateMonthlyTaskField(5, "group_name", "CÔNG VIỆC CHUNG", "DISCORD BOT");
    expect(query.update).toHaveBeenCalledWith({ group_name: "DISCORD BOT" });
    expect(query.eq.mock.calls).toEqual([["id", 5], ["group_name", "CÔNG VIỆC CHUNG"]]);
  });

  it("reports a locked month when saving a group", async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "This report month is locked" } });
    await expect(updateMonthlyTaskField(5, "group_name", "CÔNG VIỆC CHUNG", "DISCORD BOT"))
      .rejects.toThrow("Owner cần mở khóa");
  });
});

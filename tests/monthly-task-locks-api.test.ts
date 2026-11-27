import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/supabase/errors", () => ({
  getSafeErrorMessage: () => "Không thể kiểm tra trạng thái khóa.",
}));

import { loadMonthlyTaskLock, setMonthlyTaskLock } from "../supabase/monthly-tasks-api";

beforeEach(() => vi.resetAllMocks());

describe("monthly task lock API", () => {
  it("reads the server's lock and owner permissions for the selected month", async () => {
    const status = { locked: true, can_manage: false, past_month: true };
    mocks.rpc.mockResolvedValue({ data: [status], error: null });
    await expect(loadMonthlyTaskLock("2026-03")).resolves.toEqual(status);
    expect(mocks.rpc).toHaveBeenCalledWith("monthly_task_lock_status", { p_month: "2026-03-01" });
  });

  it("rejects a missing or malformed lock status instead of enabling edits", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ locked: false }], error: null });
    await expect(loadMonthlyTaskLock("2026-03")).rejects.toThrow("không hợp lệ");
  });

  it("requests unlocking without granting authority on the client", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    await setMonthlyTaskLock("2026-03", false);
    expect(mocks.rpc).toHaveBeenCalledWith("set_monthly_task_lock", {
      p_month: "2026-03-01", p_locked: false,
    });
  });
});

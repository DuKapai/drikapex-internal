import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), range: vi.fn() }));
vi.mock("@/supabase/client", () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/supabase/errors", () => ({ getSafeErrorMessage: () => "Không thể kết nối." }));
import { deleteMonthlyReportNote, loadMonthlyReportNotes, saveMonthlyReportNote, type MonthlyReportNote } from "../supabase/monthly-report-notes-api";

const note: MonthlyReportNote = {
  id: "note-one", report_month: "2026-11-01", kind: "difficulty", body: "Need assistance",
  author_name: null, mine: false, can_edit: false, revision: 2,
};

beforeEach(() => { vi.clearAllMocks(); });

describe("monthly report notes", () => {
  it("loads the selected month without inventing an anonymous author's name", async () => {
    mocks.rpc.mockReturnValue({ range: mocks.range });
    mocks.range.mockResolvedValue({ data: [note], error: null });
    await expect(loadMonthlyReportNotes("2026-11")).resolves.toEqual([note]);
    expect(mocks.rpc).toHaveBeenCalledWith("list_monthly_report_notes", { p_month: "2026-11-01" });
    mocks.range.mockResolvedValueOnce({ data: [{ ...note, can_edit: undefined }], error: null });
    await expect(loadMonthlyReportNotes("2026-11")).rejects.toThrow("không hợp lệ");
  });

  it("refuses blank drafts and preserves the original revision when saving", async () => {
    await expect(saveMonthlyReportNote("2026-11", "difficulty", "   ", null)).rejects.toThrow("1 đến 4000");
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: note.id, error: null });
    await saveMonthlyReportNote("2026-11", "difficulty", " Updated ", note);
    expect(mocks.rpc).toHaveBeenCalledWith("save_monthly_report_note", {
      p_id: note.id, p_month: "2026-11-01", p_kind: "difficulty", p_body: "Updated", p_expected_revision: 2,
    });
  });

  it("surfaces conflicts and month locks for edits and deletions", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "40001" } });
    await expect(saveMonthlyReportNote("2026-11", "difficulty", "Updated", note)).rejects.toThrow("phiên khác");
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "This report month is locked" } });
    await expect(deleteMonthlyReportNote(note)).rejects.toThrow("đã bị khóa");
    expect(mocks.rpc).toHaveBeenLastCalledWith("delete_monthly_report_note", { p_id: note.id, p_expected_revision: 2 });
  });
});

import { getSupabaseClient } from "@/supabase/client";
import { getSafeErrorMessage } from "@/supabase/errors";

export type MonthlyNoteKind = "difficulty" | "proposal";
export type MonthlyReportNote = {
  id: string;
  report_month: string;
  kind: MonthlyNoteKind;
  body: string;
  author_name: string | null;
  mine: boolean;
  can_edit: boolean;
  revision: number;
};

function failure(error: unknown): Error {
  if (error && typeof error === "object") {
    if ("message" in error && error.message === "This report month is locked") {
      return new Error("Tháng báo cáo đã bị khóa. Nội dung chưa lưu vẫn được giữ lại.");
    }
    if ("code" in error && error.code === "40001") {
      return new Error("Nội dung đã thay đổi ở phiên khác. Hãy sao chép bản nháp, hủy sửa rồi tải lại trước khi lưu.");
    }
  }
  return new Error(getSafeErrorMessage(error));
}

function isReportNote(row: unknown): row is MonthlyReportNote {
  return !!row && typeof row === "object"
    && "id" in row && typeof row.id === "string"
    && "report_month" in row && typeof row.report_month === "string"
    && "kind" in row && (row.kind === "difficulty" || row.kind === "proposal")
    && "body" in row && typeof row.body === "string"
    && "author_name" in row && (row.author_name === null || typeof row.author_name === "string")
    && "mine" in row && typeof row.mine === "boolean"
    && "can_edit" in row && typeof row.can_edit === "boolean"
    && "revision" in row && Number.isInteger(row.revision);
}

export async function loadMonthlyReportNotes(month: string): Promise<MonthlyReportNote[]> {
  const rows: MonthlyReportNote[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await getSupabaseClient().rpc("list_monthly_report_notes", { p_month: `${month}-01` })
      .range(offset, offset + 999);
    if (error) throw failure(error);
    if (!Array.isArray(data) || !data.every(isReportNote)) {
      throw new Error("Dữ liệu khó khăn, đề xuất không hợp lệ.");
    }
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

export async function saveMonthlyReportNote(
  month: string, kind: MonthlyNoteKind, body: string, previous: MonthlyReportNote | null,
): Promise<string> {
  if (!body.trim() || body.trim().length > 4000) throw new Error("Vui lòng nhập nội dung từ 1 đến 4000 ký tự.");
  const { data, error } = await getSupabaseClient().rpc("save_monthly_report_note", {
    p_id: previous?.id ?? null, p_month: `${month}-01`, p_kind: kind, p_body: body.trim(),
    p_expected_revision: previous?.revision ?? null,
  });
  if (error) throw failure(error);
  if (typeof data !== "string") throw new Error("Chưa xác nhận được việc lưu. Hãy tải lại trước khi gửi tiếp.");
  return data;
}

export async function deleteMonthlyReportNote(note: MonthlyReportNote): Promise<void> {
  const { error } = await getSupabaseClient().rpc("delete_monthly_report_note", {
    p_id: note.id, p_expected_revision: note.revision,
  });
  if (error) throw failure(error);
}

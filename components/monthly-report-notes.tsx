"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteMonthlyReportNote, loadMonthlyReportNotes, saveMonthlyReportNote,
  type MonthlyNoteKind, type MonthlyReportNote,
} from "@/supabase/monthly-report-notes-api";

const sections: { kind: MonthlyNoteKind; number: string; title: string; label: string; privacy: string }[] = [
  { kind: "difficulty", number: "II", title: "KHÓ KHĂN, VƯỚNG MẮC", label: "khó khăn",
    privacy: "Mọi người xem được nội dung; chỉ bạn và quản lý thấy tên người gửi." },
  { kind: "proposal", number: "III", title: "ĐỀ XUẤT, KIẾN NGHỊ", label: "đề xuất",
    privacy: "Mọi người xem được nội dung và người gửi." },
];
type NoteEdit = { previous: MonthlyReportNote; body: string };

export default function MonthlyReportNotes({ month, readOnly, onDirtyChange }: {
  month: string; readOnly: boolean; onDirtyChange: (dirty: boolean) => void;
}) {
  const [notes, setNotes] = useState<MonthlyReportNote[]>([]);
  const [edits, setEdits] = useState<Record<string, NoteEdit>>({});
  const [draft, setDraft] = useState<{ kind: MonthlyNoteKind; body: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MonthlyReportNote | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sequenceRef = useRef(0);
  const busyRef = useRef(false);
  const dirtyRef = useRef(false);
  const dirty = Object.keys(edits).length > 0 || !!draft?.body || saving || !!deleteTarget;

  useEffect(() => {
    dirtyRef.current = dirty;
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const refresh = useCallback((force = false) => {
    const sequence = ++sequenceRef.current;
    return loadMonthlyReportNotes(month).then((rows) => {
      if (sequence === sequenceRef.current && (force || !dirtyRef.current)) {
        setNotes(rows);
        setLoadError("");
      }
    }).catch((cause: unknown) => {
      if (sequence === sequenceRef.current) {
        setLoadError(cause instanceof Error ? cause.message : "Không tải được khó khăn, đề xuất.");
      }
    }).finally(() => {
      if (sequence === sequenceRef.current) setLoading(false);
    });
  }, [month]);

  useEffect(() => {
    const sequence = sequenceRef;
    void refresh();
    const timer = window.setInterval(() => {
      if (!dirtyRef.current && !busyRef.current) void refresh();
    }, 10000);
    return () => { sequence.current++; window.clearInterval(timer); };
  }, [refresh]);

  useEffect(() => {
    if (deleteTarget && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [deleteTarget]);

  async function save(kind: MonthlyNoteKind, body: string, previous: MonthlyReportNote | null) {
    if (readOnly || busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    setError("");
    sequenceRef.current++;
    try {
      const id = await saveMonthlyReportNote(month, kind, body, previous);
      if (previous) {
        setNotes((rows) => rows.map((row) => row.id === id
          ? { ...row, body: body.trim(), revision: previous.revision + 1 } : row));
        setEdits((current) => { const next = { ...current }; delete next[previous.id]; return next; });
      } else {
        setNotes((rows) => [...rows, {
          id, report_month: `${month}-01`, kind, body: body.trim(),
          author_name: null, mine: true, can_edit: true, revision: 1,
        }]);
        setDraft(null);
      }
      await refresh(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không lưu được nội dung. Bản nháp vẫn được giữ lại.");
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  async function remove(note: MonthlyReportNote) {
    if (readOnly || busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    setError("");
    sequenceRef.current++;
    try {
      await deleteMonthlyReportNote(note);
      setNotes((rows) => rows.filter((row) => row.id !== note.id));
      await refresh(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không xóa được nội dung.");
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  return <>
    {saving && <p className="monthly__empty" role="status">Đang lưu khó khăn, đề xuất...</p>}
    {error && <p className="inline-message" role="alert">{error}</p>}
    {loadError && <div className="inline-message" role="alert">
      <p>Không tải được khó khăn, đề xuất: {loadError}</p>
      <button type="button" className="button" disabled={saving || dirty} onClick={() => void refresh(true)}>Thử tải lại</button>
    </div>}
    {sections.map((section) => <section key={section.kind} className="monthly__notes-section" aria-label={section.title}>
      <div className="monthly__section-heading">
        <h2><span>{section.number}</span>{section.title}</h2>
      </div>
      <div className="monthly__notes">
        <p className="monthly__empty">{section.privacy}</p>
        {loading ? <p className="monthly__empty">Đang tải...</p> : !loadError &&
          !notes.some((note) => note.kind === section.kind) && <p className="monthly__empty">Chưa có {section.label} trong tháng này.</p>}
        {notes.filter((note) => note.kind === section.kind).map((note) => {
          const edit = edits[note.id];
          return <article key={note.id} className="monthly__note">
            <div className="monthly__note-heading">
              <strong>{note.author_name || (note.mine ? "Bạn" : "Khó khăn được chia sẻ")}{note.mine && note.author_name ? " · Bạn" : ""}</strong>
              {note.can_edit && <button type="button" className="monthly__delete" aria-label={`Xóa ${section.label}`}
                disabled={readOnly || saving || !!edit} onClick={() => setDeleteTarget(note)}>×</button>}
            </div>
            {note.can_edit ? <textarea aria-label={`Nội dung ${section.label} ${note.id}`} maxLength={4000}
              disabled={readOnly || saving} value={edit?.body ?? note.body}
              onChange={(event) => {
                const body = event.target.value;
                setEdits((current) => ({ ...current, [note.id]: { previous: current[note.id]?.previous ?? note, body } }));
              }} /> : <p className="monthly__note-text">{note.body}</p>}
            {edit && <div className="monthly__retry">
              <button type="button" disabled={readOnly || saving} onClick={() => void save(note.kind, edit.body, edit.previous)}>Lưu {section.label}</button>
              <button type="button" disabled={saving} onClick={() => {
                setEdits((current) => { const next = { ...current }; delete next[note.id]; return next; });
                setError("");
              }}>Hủy sửa</button>
            </div>}
          </article>;
        })}
        {draft?.kind === section.kind ? <form className="monthly__note" onSubmit={(event) => {
          event.preventDefault(); void save(draft.kind, draft.body, null);
        }}>
          <textarea aria-label={`${section.label} mới`} placeholder={`Nhập ${section.label}...`} required maxLength={4000}
            value={draft.body} disabled={readOnly || saving}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
          <div className="monthly__retry">
            <button type="submit" disabled={readOnly || saving}>Lưu {section.label}</button>
            <button type="button" disabled={saving} onClick={() => { setDraft(null); setError(""); }}>Hủy</button>
          </div>
        </form> : <button type="button" className="monthly__add" disabled={readOnly || saving || loading || !!loadError || !!draft}
          onClick={() => { setDraft({ kind: section.kind, body: "" }); setError(""); }}>＋ Thêm {section.label}</button>}
      </div>
    </section>)}
    <dialog ref={dialogRef} className="monthly__dialog" aria-labelledby="monthly-note-delete-title" onClose={() => setDeleteTarget(null)}>
      {deleteTarget && <>
        <h2 id="monthly-note-delete-title">Xóa {deleteTarget.kind === "difficulty" ? "khó khăn" : "đề xuất"}?</h2>
        <p className="monthly__dialog-task">{deleteTarget.body}</p>
        <p className="monthly__dialog-warning">Thao tác này không thể hoàn tác.</p>
        <div className="monthly__dialog-actions">
          <button type="button" className="button" autoFocus onClick={() => dialogRef.current?.close()}>Hủy</button>
          <button type="button" className="button monthly__dialog-delete" disabled={readOnly || saving} onClick={() => {
            const note = deleteTarget; dialogRef.current?.close(); void remove(note);
          }}>Xóa nội dung</button>
        </div>
      </>}
    </dialog>
  </>;
}

"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  deleteMonthlyTask, loadMonthlyTasks, loadMonthlyTaskLock, loadTaskPeople, saveMonthlyTask, saveMonthlyTaskAssignees, setMonthlyTaskLock, updateMonthlyTaskField,
  type MonthlyTask, type MonthlyTaskField, type MonthlyTaskInput, type MonthlyTaskLockStatus, type TaskPerson,
} from "@/supabase/monthly-tasks-api";
import { isCompletedMonthlyTask, isOutsideReportMonth, matchesMonthlyTaskFilters, type MonthlyTaskFilters } from "@/lib/monthly-tasks";
import { canSaveMonthlyTaskAssignees, toggleMonthlyTaskAssignee } from "@/lib/monthly-task-assignees";
import { groupMonthlyTasks, normalizeTaskGroup, suggestedTaskGroups } from "@/lib/monthly-task-groups";
import { useWorkspacePresence } from "@/components/workspace-presence";
import DatePicker from "@/components/date-picker";
import MonthlyGroupPicker from "@/components/monthly-group-picker";
import MonthlyReportNotes from "@/components/monthly-report-notes";
import "./monthly-tasks.css";

const statuses = ["Chưa bắt đầu", "Đang thực hiện", "Đã hoàn thành", "Cần làm lại", "Tạm hoãn"];
type Draft = { title: string; group: string; priority: string; assigneeIds: string[]; status: string; date: string; note: string };
type CellEdit = { base: string | null; value: string };
const emptyFilters: MonthlyTaskFilters = { search: "", searchType: "all", title: "", status: "", priority: "", assignee: "", date: "", note: "" };

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function emptyDraft(userId: string, group = suggestedTaskGroups[0]): Draft {
  return { title: "", group, priority: "", assigneeIds: [userId], status: "Đang thực hiện", date: "", note: "" };
}

export default function MonthlyTasks({ userId, manager, owner, onDirtyChange }: { userId: string; manager: boolean; owner: boolean; onDirtyChange: (dirty: boolean) => void }) {
  const presence = useWorkspacePresence();
  const [month, setMonth] = useState(currentMonth);
  const [tasks, setTasks] = useState<MonthlyTask[]>([]);
  const [people, setPeople] = useState<TaskPerson[]>([]);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(userId));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [rosterError, setRosterError] = useState("");
  const [teamAssignmentsAvailable, setTeamAssignmentsAvailable] = useState(true);
  const [lockState, setLockState] = useState<{ month: string; status: MonthlyTaskLockStatus } | null>(null);
  const [lockError, setLockError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showDraft, setShowDraft] = useState(false);
  const [draftLocation, setDraftLocation] = useState<string | null>(null);
  const [draftInitialGroup, setDraftInitialGroup] = useState(suggestedTaskGroups[0]);
  const [notesDirty, setNotesDirty] = useState(false);
  const [filters, setFilters] = useState<MonthlyTaskFilters>(emptyFilters);
  const [deleteTarget, setDeleteTarget] = useState<MonthlyTask | null>(null);
  const [cellEdits, setCellEdits] = useState<Record<string, CellEdit>>({});
  const [teamEdits, setTeamEdits] = useState<Record<number, string[]>>({});
  const editsRef = useRef<Record<string, CellEdit>>({});
  const pendingRef = useRef(false);
  const lockSequence = useRef(0);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const newTaskRef = useRef<HTMLFormElement>(null);
  const [syncError, setSyncError] = useState("");
  const loadSequence = useRef(0);
  const draftDirty = showDraft && !!(draft.title || draft.note || draft.date || draft.priority || draft.group !== draftInitialGroup ||
    draft.assigneeIds.length !== 1 || draft.assigneeIds[0] !== userId || draft.status !== "Đang thực hiện");
  const dirty = Object.keys(cellEdits).length > 0 || Object.keys(teamEdits).length > 0 || draftDirty || saving || notesDirty;
  const lockStatus = lockState?.month === month ? lockState.status : null;
  const readOnly = !lockStatus || lockStatus.locked;

  useEffect(() => {
    if (showDraft) newTaskRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [showDraft]);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (deleteTarget && dialog && !dialog.open) dialog.showModal();
  }, [deleteTarget]);

  useEffect(() => {
    let active = true;
    const sequenceRef = lockSequence;
    async function refreshLock() {
      const sequence = ++sequenceRef.current;
      try {
        const status = await loadMonthlyTaskLock(month);
        if (active && sequence === sequenceRef.current && !pendingRef.current) {
          setLockState({ month, status });
          setLockError("");
        }
      } catch (cause) {
        if (active && sequence === sequenceRef.current) {
          setLockState(null);
          setLockError(cause instanceof Error ? cause.message : "Không thể kiểm tra trạng thái khóa.");
        }
      }
    }
    void refreshLock();
    const timer = window.setInterval(() => void refreshLock(), 10000);
    return () => { active = false; sequenceRef.current++; window.clearInterval(timer); };
  }, [month]);

  useEffect(() => {
    onDirtyChange(dirty);
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, onDirtyChange]);

  const refresh = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const taskResult = await loadMonthlyTasks(month);
      if (sequence === loadSequence.current) {
        setTasks(taskResult.rows);
        setTeamAssignmentsAvailable(taskResult.teamAssignmentsAvailable);
        setLoadError("");
      }
      try {
        const users = await loadTaskPeople();
        if (sequence === loadSequence.current) {
          setPeople(users);
          setRosterError("");
        }
      } catch (cause) {
        if (sequence === loadSequence.current) {
          setPeople([]);
          setRosterError(cause instanceof Error ? cause.message : "Không thể tải danh sách nhân sự.");
        }
      }
    } catch (cause) {
      if (sequence === loadSequence.current) {
        setLoadError(cause instanceof Error ? cause.message : "Không thể tải công việc.");
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    let active = true;
    const timer = window.setInterval(() => {
      if (pendingRef.current || Object.keys(editsRef.current).length || Object.keys(teamEdits).length) return;
      void loadMonthlyTasks(month).then((result) => {
        if (active && !pendingRef.current && !Object.keys(editsRef.current).length) {
          setTasks(result.rows);
          setTeamAssignmentsAvailable(result.teamAssignmentsAvailable);
          setSyncError("");
        }
      }).catch(() => {
        if (active) setSyncError("Không thể cập nhật dữ liệu mới. Hãy kiểm tra kết nối và thử tải lại.");
      });
    }, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [month, teamEdits]);

  function setCellEdit(task: MonthlyTask, field: MonthlyTaskField, value: string) {
    const key = `${task.id}:${field}`;
    editsRef.current = {
      ...editsRef.current,
      [key]: { base: editsRef.current[key] ? editsRef.current[key].base : task[field], value },
    };
    setCellEdits(editsRef.current);
  }

  function discardCellEdit(task: MonthlyTask, field: MonthlyTaskField) {
    const next = { ...editsRef.current };
    delete next[`${task.id}:${field}`];
    editsRef.current = next;
    setCellEdits(next);
  }

  function cancelTaskEdits(task: MonthlyTask) {
    for (const field of ["title", "group_name", "priority", "status", "work_date", "note"] as const) discardCellEdit(task, field);
    setError("");
    if (!Object.keys(editsRef.current).length) void refresh();
  }

  function toggleAssignee(values: string[], selectedId: string, checked: boolean): string[] {
    const result = toggleMonthlyTaskAssignee(values, selectedId, checked, userId, owner);
    if (result.selfRequired) {
      setError("Bạn phải giữ tên mình trong công việc khi cùng giao cho nhân sự khác.");
    }
    return result.userIds;
  }

  async function saveTeam(task: MonthlyTask) {
    if (readOnly) return;
    const assigneeIds = teamEdits[task.id];
    if (!assigneeIds) return;
    if (!canSaveMonthlyTaskAssignees(assigneeIds, userId, owner)) {
      setError(owner ? "Chọn ít nhất một người phụ trách." : "Bạn phải có tên trong danh sách người phụ trách.");
      return;
    }
    if (pendingRef.current) return;
    pendingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await saveMonthlyTaskAssignees(task.id, assigneeIds, task.assignee_ids);
      setTasks((rows) => rows.map((row) => row.id === task.id ? { ...row, assignee_ids: assigneeIds } : row));
      setTeamEdits((rows) => {
        const next = { ...rows };
        delete next[task.id];
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể cập nhật người phụ trách.");
    } finally {
      pendingRef.current = false;
      setSaving(false);
    }
  }

  async function saveCell(task: MonthlyTask, field: MonthlyTaskField, raw: string) {
    if (readOnly) return;
    if (pendingRef.current) return;
    const key = `${task.id}:${field}`;
    const base = editsRef.current[key] ? editsRef.current[key].base : task[field];
    const value = field === "group_name" ? normalizeTaskGroup(raw) : field === "title" ? raw.trim() : raw;
    const savedValue = field === "title" || field === "group_name" ? value : value || null;
    if (field === "group_name" && (!value || value.length > 100)) {
      setError("Tên nhóm cần từ 1 đến 100 ký tự. Thay đổi chưa được lưu.");
      return;
    }
    if (field === "title" && !value) {
      setCellEdit(task, field, raw);
      setError("Công việc không được để trống. Nội dung chưa lưu vẫn được giữ lại.");
      return;
    }
    if (savedValue === base) { discardCellEdit(task, field); return; }
    setCellEdit(task, field, raw);
    pendingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await updateMonthlyTaskField(task.id, field, base, savedValue);
      setTasks((rows) => rows.map((row) => row.id === task.id ? { ...row, [field]: savedValue } : row));
      discardCellEdit(task, field);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu thay đổi.");
    } finally {
      pendingRef.current = false;
      setSaving(false);
    }
  }

  useEffect(() => {
    const sequenceRef = loadSequence;
    const sequence = ++sequenceRef.current;
    loadMonthlyTasks(month).then(async (result) => {
      if (sequence === sequenceRef.current) {
        setTasks(result.rows);
        setTeamAssignmentsAvailable(result.teamAssignmentsAvailable);
        setLoadError("");
        setLoading(false);
      }
      try {
        const users = await loadTaskPeople();
        if (sequence === sequenceRef.current) {
          setPeople(users);
          setRosterError("");
        }
      } catch (cause) {
        if (sequence === sequenceRef.current) {
          setPeople([]);
          setRosterError(cause instanceof Error ? cause.message : "Không thể tải danh sách nhân sự.");
        }
      }
    }).catch((cause: unknown) => {
      if (sequence === sequenceRef.current) {
        setLoadError(cause instanceof Error ? cause.message : "Không thể tải công việc.");
        setLoading(false);
      }
    });
    return () => { sequenceRef.current++; };
  }, [month]);

  function retry() {
    setLoading(true);
    setLoadError("");
    void refresh();
  }

  function chooseMonth(value: string) {
    if (!/^\d{4}-\d{2}$/.test(value) || value === month) return;
    if (Object.keys(editsRef.current).length || Object.keys(teamEdits).length || notesDirty) {
      setError("Còn công việc, khó khăn hoặc đề xuất chưa lưu. Hãy lưu hoặc hủy thay đổi trước khi chuyển tháng.");
      return;
    }
    if (draftDirty &&
      !window.confirm("Bỏ thay đổi chưa lưu và chuyển tháng?")) return;
    loadSequence.current++;
    setLoading(true);
    setLoadError("");
    setError("");
    setMonth(value);
    setDraft(emptyDraft(userId));
    setDraftLocation(null);
    setShowDraft(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    if (pendingRef.current || Object.keys(editsRef.current).length || Object.keys(teamEdits).length) {
      setError("Hãy lưu hoặc hủy thay đổi trong bảng trước khi thêm công việc.");
      return;
    }
    if (!draft.title.trim() || !draft.assigneeIds.length || (!owner && !draft.assigneeIds.includes(userId))) {
      setError(owner ? "Vui lòng nhập công việc và chọn ít nhất một người phụ trách." : "Vui lòng nhập công việc và giữ tên bạn trong danh sách người phụ trách.");
      return;
    }
    const groupName = normalizeTaskGroup(draft.group);
    if (!groupName || groupName.length > 100) {
      setError("Vui lòng chọn hoặc nhập tên nhóm từ 1 đến 100 ký tự.");
      return;
    }
    const input: MonthlyTaskInput = {
      report_month: `${month}-01`, title: draft.title.trim(), priority: draft.priority || null,
      group_name: groupName,
      assignee_id: draft.assigneeIds.includes(userId) ? userId : draft.assigneeIds[0], status: draft.status || null, work_date: draft.date || null,
      note: draft.note.trim() || null,
    };
    pendingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await saveMonthlyTask(null, input, draft.assigneeIds);
      setDraft(emptyDraft(userId));
      setDraftLocation(null);
      setShowDraft(false);
      setLoading(true);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu công việc.");
    } finally { pendingRef.current = false; setSaving(false); }
  }

  function requestRemove(task: MonthlyTask) {
    if (readOnly) return;
    if (pendingRef.current || Object.keys(editsRef.current).length || Object.keys(teamEdits).length) {
      setError("Hãy lưu hoặc hủy thay đổi trong bảng trước khi xóa công việc.");
      return;
    }
    setDeleteTarget(task);
  }

  async function remove(task: MonthlyTask) {
    if (readOnly) {
      setError("Không thể xóa khi tháng đã khóa hoặc chưa xác định được trạng thái khóa.");
      return;
    }
    if (pendingRef.current || Object.keys(editsRef.current).length || Object.keys(teamEdits).length) {
      setError("Hãy lưu hoặc hủy thay đổi trong bảng trước khi xóa công việc.");
      return;
    }
    pendingRef.current = true;
    setSaving(true);
    try {
      await deleteMonthlyTask(task.id);
      setLoading(true);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể xóa công việc.");
    } finally { pendingRef.current = false; setSaving(false); }
  }

  async function changeLock() {
    if (!lockStatus?.can_manage || !lockStatus.past_month || dirty || pendingRef.current) return;
    const next = !lockStatus.locked;
    if (!window.confirm(`${next ? "Khóa" : "Mở khóa"} tháng ${month}?${next ? " Mọi người sẽ chỉ được xem cho đến khi mở khóa." : ""}`)) return;
    lockSequence.current++;
    pendingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await setMonthlyTaskLock(month, next);
      setLockState({ month, status: { ...lockStatus, locked: next } });
      setLockError("");
    } catch (cause) {
      setLockState(null);
      setLockError(cause instanceof Error ? cause.message : "Không thể thay đổi trạng thái khóa.");
    } finally {
      pendingRef.current = false;
      setSaving(false);
    }
  }

  const filteredTasks = tasks.filter((task) => matchesMonthlyTaskFilters(task, people, filters));
  const filteredIds = new Set(filteredTasks.map((task) => task.id));
  const visible = tasks.filter((task) => filteredIds.has(task.id) ||
    Object.keys(cellEdits).some((key) => key.startsWith(`${task.id}:`)) || !!teamEdits[task.id]);
  const activeFilters = [filters.search, filters.title, filters.status, filters.priority, filters.assignee, filters.date, filters.note].filter(Boolean).length;
  const statusOptions = Array.from(new Set([...statuses, ...tasks.flatMap((task) => task.status && !isCompletedMonthlyTask(task.status) ? [task.status] : [])]));
  const priorityOptions = Array.from(new Set(["1", "2", "3", ...tasks.flatMap((task) => task.priority ? [task.priority] : [])]));
  const completed = tasks.filter((task) => isCompletedMonthlyTask(task.status)).length;
  const groups = groupMonthlyTasks(visible);
  const groupOptions = Array.from(new Set([...suggestedTaskGroups, ...tasks.map((task) => normalizeTaskGroup(task.group_name))]));

  function openDraft(group = suggestedTaskGroups[0], newGroup = false) {
    setDraft(emptyDraft(userId, group));
    setDraftInitialGroup(group);
    setDraftLocation(newGroup ? "__new__" : group);
    setShowDraft(true);
    setError("");
  }

  const draftForm = showDraft && (
    <form ref={newTaskRef} className="monthly__task monthly__new-task" onSubmit={(event) => void submit(event)}>
      <span className="monthly__task-number">+</span>
      <div className="monthly__task-fields">
        <MonthlyGroupPicker label="Nhóm công việc mới" value={draft.group} options={groupOptions}
          disabled={saving || readOnly} onChange={(group) => setDraft({ ...draft, group })}
          onSelect={(group) => {
            setDraft({ ...draft, group });
            setDraftLocation(group);
          }} />
        {draft.group.trim() && normalizeTaskGroup(draft.group) !== draftLocation &&
          <small className="monthly__group-destination">Sau khi lưu, công việc sẽ thuộc nhóm {normalizeTaskGroup(draft.group)}.</small>}
        <div className="monthly__task-main">
          <textarea aria-label="Công việc mới" placeholder="Nhập nội dung công việc..." required maxLength={2000} disabled={saving || readOnly}
            value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          <select aria-label="Trạng thái công việc mới" value={draft.status} disabled={saving || readOnly}
            onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
            {statuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        </div>
        <div className="monthly__task-details">
          <label><span>Ưu tiên</span>
            <select aria-label="Ưu tiên công việc mới" value={draft.priority} disabled={saving || readOnly}
              onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>
              <option value="">Không chọn</option><option>1</option><option>2</option><option>3</option>
            </select>
          </label>
          <div className="monthly__team-field"><span>Người phụ trách</span>
            <details className="monthly__team-picker">
              <summary>{draft.assigneeIds.map((id) =>
                people.find((person) => person.id === id)?.display_name ||
                people.find((person) => person.id === id)?.username ||
                "Chọn nhân sự").join(", ") || "Chọn nhân sự"}</summary>
              <div className="monthly__team-options">
                {people.map((person) => <label key={person.id}>
                  <input type="checkbox" checked={draft.assigneeIds.includes(person.id)}
                    disabled={saving || readOnly || !teamAssignmentsAvailable ||
                      (!owner && person.id === userId && draft.assigneeIds.includes(userId))}
                    onChange={(event) => {
                      const assigneeIds = toggleAssignee(draft.assigneeIds, person.id, event.target.checked);
                      setDraft({ ...draft, assigneeIds });
                      setError("");
                    }} />
                  <span>{person.display_name || person.username || person.id}</span>
                  {presence.available && presence.onlineMembers.some((online) => online.user_id === person.id) &&
                    <small>Trực tuyến</small>}
                </label>)}
                {!owner && <small className="monthly__team-hint">Bạn là người phụ trách bắt buộc khi giao chung.</small>}
              </div>
            </details>
          </div>
          <div className="monthly__date-field">
            <span>Ngày làm</span>
            <DatePicker kind="date" label="Ngày làm công việc mới" value={draft.date} disabled={saving || readOnly}
              onChange={(date) => setDraft({ ...draft, date })} />
            {draft.date && isOutsideReportMonth(draft.date, month) &&
              <small className="monthly__warning">Ngày lệch tháng báo cáo</small>}
          </div>
          <label><span>Ghi chú</span>
            <textarea aria-label="Ghi chú công việc mới" placeholder="Ghi chú..." value={draft.note}
              disabled={saving || readOnly} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
          </label>
        </div>
        <div className="monthly__retry">
          <button className="button button--primary" disabled={saving || readOnly || !teamAssignmentsAvailable}>
            {saving ? "Đang lưu..." : "Lưu công việc"}
          </button>
          <button type="button" disabled={saving} onClick={() => {
            if (draftDirty && !window.confirm("Bỏ nội dung công việc mới chưa lưu?")) return;
            setDraft(emptyDraft(userId));
            setDraftLocation(null);
            setShowDraft(false);
          }}>Hủy</button>
        </div>
      </div>
    </form>
  );

  return (
    <section className="monthly">
      <header className="monthly__header">
        <div><span className="eyebrow">WORKSPACE · BÁO CÁO THÁNG</span><h1>Lịch trình công việc</h1></div>
        <div className="monthly__header-actions">
          {lockStatus?.can_manage && lockStatus.past_month && <button className="button" type="button" disabled={dirty} onClick={() => void changeLock()}>{lockStatus.locked ? "Mở khóa tháng" : "Khóa tháng"}</button>}
          <div className="monthly__month-field"><span>Tháng báo cáo</span><DatePicker kind="month" label="Tháng báo cáo" value={month} onChange={chooseMonth} disabled={saving} /></div>
        </div>
      </header>
      {error && <p className="inline-message" role="alert">{error}</p>}
      {syncError && <p className="inline-message" role="alert">{syncError}</p>}
      {(presence.error || !teamAssignmentsAvailable || rosterError || lockError) && <div className="inline-message" role="status">
        <strong>Một số chức năng chưa sẵn sàng:</strong>
        <ul>
          {presence.error && <li>Trạng thái trực tuyến: {presence.error}</li>}
          {!teamAssignmentsAvailable && <li>Phân công nhóm chưa được cài đặt; dữ liệu cũ vẫn hiển thị.</li>}
          {rosterError && <li>Danh sách nhân sự: {rosterError}</li>}
          {lockError && <li>Không kiểm tra được khóa tháng: {lockError} Tạm thời chỉ xem để tránh sửa nhầm.</li>}
        </ul>
      </div>}
      {lockStatus?.locked && <p className="inline-message" role="status">Tháng này đã khóa. Chỉ xem cho đến khi Owner mở khóa.</p>}
      {loadError && <div className="inline-message" role="alert">
        <p>Không tải được dữ liệu công việc: {loadError}</p>
        <p>Danh sách và số liệu không thể hiển thị cho đến khi kết nối được khôi phục.</p>
        <button type="button" className="button" onClick={retry}>Thử tải lại</button>
      </div>}
      {loading && <p>Đang tải dữ liệu công việc...</p>}
      {!loading && !loadError && <>
      <div className="monthly__toolbar">
        <span>{presence.available ? `${people.filter((person) => presence.onlineMembers.some((online) => online.user_id === person.id)).length} nhân sự trực tuyến` : "Trạng thái trực tuyến chưa xác định"}</span>
        <span aria-live="polite">{saving ? "Đang lưu..." : dirty ? "Có thay đổi chưa lưu" : "Tự cập nhật mỗi 10 giây"}</span>
      </div>
      <div className="monthly__section-heading">
        <h2><span>I</span> KẾT QUẢ THỰC HIỆN CÔNG VIỆC</h2>
        <div className="monthly__progress">
          <progress value={completed} max={Math.max(tasks.length, 1)} aria-label="Tiến độ hoàn thành" />
          <strong>{completed}/{tasks.length}</strong> hoàn thành
        </div>
      </div>
        <details className="monthly__filters">
          <summary>Bộ lọc và tìm kiếm{activeFilters > 0 && ` · ${activeFilters} đang dùng`}</summary>
          <div className="monthly__filter-content">
            <div className="monthly__search">
              <label>Loại tìm kiếm<select aria-label="Loại tìm kiếm" value={filters.searchType} onChange={(event) => {
                const value = event.target.value;
                if (value === "all" || value === "people" || value === "task" || value === "time") setFilters({ ...filters, searchType: value });
              }}>
                <option value="all">Tất cả</option><option value="people">Nhân sự</option><option value="task">Công việc</option><option value="time">Thời gian</option>
              </select></label>
              <label>Tìm kiếm<input aria-label="Tìm kiếm công việc" placeholder="Nhập nội dung tìm kiếm..." value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label>
              <button type="button" className="monthly__clear-filters" onClick={() => setFilters(emptyFilters)} disabled={!activeFilters && filters.searchType === "all"}>Xóa bộ lọc</button>
            </div>
            <div className="monthly__filter-fields">
              <label>Công việc<input value={filters.title} onChange={(event) => setFilters({ ...filters, title: event.target.value })} placeholder="Lọc công việc" /></label>
              <label>Trạng thái<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
                <option value="">Tất cả</option>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
              </select></label>
              <label>Ưu tiên<select value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}>
                <option value="">Tất cả</option>{priorityOptions.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
              </select></label>
              <label>Người phụ trách<select value={filters.assignee} onChange={(event) => setFilters({ ...filters, assignee: event.target.value })}>
                <option value="">Tất cả</option>{people.map((person) => <option key={person.id} value={person.id}>{person.display_name || person.username || "Chưa đối chiếu"}</option>)}
                <option value="unmatched">Chưa đối chiếu tài khoản</option>
              </select></label>
              <div className="monthly__filter-date"><span>Ngày làm</span><DatePicker kind="date" label="Lọc ngày làm" value={filters.date} onChange={(date) => setFilters({ ...filters, date })} /></div>
              <label>Ghi chú<input value={filters.note} onChange={(event) => setFilters({ ...filters, note: event.target.value })} placeholder="Lọc ghi chú" /></label>
            </div>
            <small aria-live="polite">{filteredTasks.length}/{tasks.length} công việc phù hợp{visible.length > filteredTasks.length ? " · Nội dung chưa lưu vẫn được hiển thị" : ""}</small>
          </div>
        </details>
          {visible.length === 0 && <div className="monthly__empty">
            {tasks.length === 0
              ? manager
                ? "Tháng này chưa có công việc. Bạn có thể chọn tháng khác ở mục Tháng báo cáo."
                : "Bạn chưa được phân công công việc trong tháng này. Hãy chọn tháng khác hoặc liên hệ quản lý để được phân công."
              : <>Không có công việc khớp bộ lọc.{" "}
                <button type="button" className="monthly__clear-filters" onClick={() => setFilters(emptyFilters)}>Xóa bộ lọc</button>
              </>}
          </div>}
      {groups.map((group, groupIndex) => <section className="monthly__group" aria-label={group.name} key={group.name}>
        <div className="monthly__group-heading"><span className="monthly__group-number">{groupIndex + 1}</span><h3>{group.name}</h3>
          <span>{group.tasks.filter((task) => isCompletedMonthlyTask(task.status)).length}/{group.tasks.length} xong</span></div>
        <div className="monthly__task-list">
          {group.tasks.map((task, index) => <article className="monthly__task" key={task.id}>
            <span className="monthly__task-number">{index + 1}</span>
            <div className="monthly__task-fields">
              <div className="monthly__task-main">
                <textarea aria-label={`Công việc ${task.id}`} maxLength={2000} disabled={saving || readOnly}
                  value={cellEdits[`${task.id}:title`]?.value ?? task.title}
                  onChange={(e) => setCellEdit(task, "title", e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape" && cellEdits[`${task.id}:title`]) { e.preventDefault(); cancelTaskEdits(task); } }}
                  onBlur={(e) => {
                    if (!(e.relatedTarget instanceof HTMLElement && e.relatedTarget.hasAttribute("data-cancel-edits"))) void saveCell(task, "title", e.target.value);
                  }} />
                <select className={isCompletedMonthlyTask(cellEdits[`${task.id}:status`]?.value ?? task.status) ? "monthly__status monthly__status--done" : "monthly__status"}
                  aria-label={`Trạng thái ${task.id}`} value={cellEdits[`${task.id}:status`]?.value ?? task.status ?? ""} disabled={saving || readOnly}
                  onChange={(e) => void saveCell(task, "status", e.target.value)}>
                  <option value="">Chọn trạng thái</option>{task.status && !statuses.includes(task.status) && <option>{task.status}</option>}
                  {statuses.map((status) => <option key={status}>{status}</option>)}</select>
                {manager && <button className="monthly__delete" type="button" onClick={() => requestRemove(task)} disabled={saving || readOnly} aria-label={`Xóa ${task.title}`} title="Xóa công việc">×</button>}
              </div>
              <MonthlyGroupPicker label={`Nhóm công việc ${task.id}`}
                value={cellEdits[`${task.id}:group_name`]?.value ?? task.group_name}
                options={groupOptions} disabled={saving || readOnly}
                onChange={(value) => setCellEdit(task, "group_name", value)}
                onSelect={(value) => void saveCell(task, "group_name", value)} />
              <div className="monthly__task-details">
                <label><span>Ưu tiên</span><select aria-label={`Ưu tiên ${task.id}`} value={cellEdits[`${task.id}:priority`]?.value ?? task.priority ?? ""} disabled={saving || readOnly}
                  onChange={(e) => void saveCell(task, "priority", e.target.value)}>
                  <option value="">Không chọn</option>{task.priority && !["1", "2", "3"].includes(task.priority) && <option>{task.priority}</option>}
                  <option>1</option><option>2</option><option>3</option></select></label>
                <div className="monthly__team-field"><span>Người phụ trách</span>
                  {(() => {
                    const selected = teamEdits[task.id] ?? task.assignee_ids;
                    const names = selected.map((id) => {
                      const person = people.find((item) => item.id === id);
                      return person?.display_name || person?.username || (id === task.assignee_id ? task.source_assignee : null) || "Chưa đối chiếu";
                    });
                    return <details className="monthly__team-picker">
                      <summary aria-label={`Chọn người phụ trách ${task.id}`}>{names.join(", ") || "Chưa có người phụ trách"}</summary>
                      <div className="monthly__team-options">
                        {!task.assignee_ids.length && task.source_assignee && <small className="monthly__warning">Nguồn Excel: {task.source_assignee}</small>}
                        {people.map((person) => <label key={person.id}>
                          <input type="checkbox" checked={selected.includes(person.id)} disabled={saving || readOnly || !teamAssignmentsAvailable || (!owner && person.id === userId && selected.includes(userId))}
                            onChange={(event) => {
                              setTeamEdits((rows) => ({ ...rows, [task.id]: toggleAssignee(selected, person.id, event.target.checked) }));
                              setError("");
                            }} />
                          <span>{person.display_name || person.username || person.id}</span>
                          {presence.available && presence.onlineMembers.some((online) => online.user_id === person.id) && <small>Trực tuyến</small>}
                        </label>)}
                        {!owner && <small className="monthly__team-hint">Khi giao chung, bạn phải giữ tên mình trong nhóm.</small>}
                        <div className="monthly__team-actions">
                          <button type="button" disabled={saving || readOnly || !teamAssignmentsAvailable || !teamEdits[task.id]} onClick={() => void saveTeam(task)}>Lưu người phụ trách</button>
                          {teamEdits[task.id] && <button type="button" disabled={saving} onClick={() => setTeamEdits((rows) => {
                            const next = { ...rows }; delete next[task.id]; return next;
                          })}>Hủy</button>}
                        </div>
                      </div>
                    </details>;
                  })()}
                  {!task.assignee_ids.length && <small className="monthly__warning">Chưa đối chiếu tài khoản</small>}</div>
                <div className="monthly__date-field"><span>Ngày làm</span><DatePicker kind="date" label={`Ngày làm ${task.id}`} value={cellEdits[`${task.id}:work_date`]?.value ?? task.work_date ?? ""} disabled={saving || readOnly}
                  onChange={(date) => void saveCell(task, "work_date", date)} />
                  {isOutsideReportMonth(task.work_date, month) && <small className="monthly__warning">Ngày lệch tháng báo cáo</small>}</div>
                <label><span>Ghi chú</span><textarea aria-label={`Ghi chú ${task.id}`} placeholder="Ghi chú..." disabled={saving || readOnly} value={cellEdits[`${task.id}:note`]?.value ?? task.note ?? ""}
                  onChange={(e) => setCellEdit(task, "note", e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape" && cellEdits[`${task.id}:note`]) { e.preventDefault(); cancelTaskEdits(task); } }}
                  onBlur={(e) => {
                    if (!(e.relatedTarget instanceof HTMLElement && e.relatedTarget.hasAttribute("data-cancel-edits"))) void saveCell(task, "note", e.target.value);
                  }} /></label>
              </div>
              {Object.keys(cellEdits).some((key) => key.startsWith(`${task.id}:`)) && <div className="monthly__retry">
                {(["title", "group_name", "priority", "status", "work_date", "note"] as const).map((field) => cellEdits[`${task.id}:${field}`] && <button key={field} type="button" disabled={saving || readOnly}
                  onClick={() => void saveCell(task, field, cellEdits[`${task.id}:${field}`].value)}>{field === "group_name" ? "Lưu nhóm" : `Lưu lại ${field === "title" ? "công việc" : field === "note" ? "ghi chú" : "ô"}`}</button>)}
                <button type="button" data-cancel-edits disabled={saving} onPointerDown={(event) => event.preventDefault()} onClick={() => cancelTaskEdits(task)}>Hủy sửa</button>
              </div>}
            </div>
          </article>)}
          {draftLocation === group.name && draftForm}
          {!showDraft && <button className="monthly__add" type="button" onClick={() => openDraft(group.name)} disabled={readOnly || saving || !teamAssignmentsAvailable}>＋ Thêm việc vào nhóm này</button>}
        </div>
      </section>)}
      {showDraft && (draftLocation === "__new__" || !groups.some((group) => group.name === draftLocation)) && (
        <section className="monthly__group monthly__group--draft" aria-label={draftLocation === "__new__" ? "Nhóm công việc mới" : draftLocation ?? "Nhóm công việc"}>
          <div className="monthly__group-heading">
            <span className="monthly__group-number">+</span>
            <h3>{draftLocation === "__new__" ? "Nhóm công việc mới" : draftLocation}</h3>
          </div>
          <div className="monthly__task-list">{draftForm}</div>
        </section>
      )}
      {!showDraft && (
        <div className="monthly__task-list">
          <button className="monthly__add" type="button" onClick={() => openDraft("", true)}
            disabled={readOnly || saving || !teamAssignmentsAvailable}>
            ＋ Thêm công việc vào nhóm mới
          </button>
        </div>
      )}
      </>}
      <MonthlyReportNotes key={month} month={month} readOnly={readOnly || saving} onDirtyChange={setNotesDirty} />
      <dialog ref={deleteDialogRef} className="monthly__dialog" aria-labelledby="monthly-delete-title" aria-describedby="monthly-delete-description" onClose={() => setDeleteTarget(null)}>
        {deleteTarget && <>
          <div className="monthly__dialog-heading">
            <span className="monthly__dialog-icon" aria-hidden="true">!</span>
            <div><span className="monthly__dialog-eyebrow">XÁC NHẬN THAO TÁC</span><h2 id="monthly-delete-title">Xóa công việc?</h2></div>
          </div>
          <p id="monthly-delete-description">Bạn đang xóa công việc sau:</p>
          <div className="monthly__dialog-task">{deleteTarget.title}</div>
          <p className="monthly__dialog-warning">Thao tác này không thể hoàn tác.</p>
          <div className="monthly__dialog-actions">
            <button type="button" className="button" autoFocus onClick={() => deleteDialogRef.current?.close()}>Hủy</button>
            <button type="button" className="button monthly__dialog-delete" onClick={() => {
              const task = deleteTarget;
              deleteDialogRef.current?.close();
              void remove(task);
            }}>Xóa công việc</button>
          </div>
        </>}
      </dialog>
    </section>
  );
}

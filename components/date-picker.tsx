"use client";

import { useId, useRef, useState } from "react";
import "./date-picker.css";

type PickerKind = "date" | "month" | "datetime-local";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function localDate(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateAt(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateLabel(value: string, kind: PickerKind): string {
  if (!value) return kind === "month" ? "Chọn tháng" : "Chọn ngày";
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-");
  return kind === "month" ? `${month}/${year}` : `${day}/${month}/${year}${time ? ` ${time}` : ""}`;
}

export default function DatePicker({ kind, label, value, defaultValue = "", onChange, name, disabled = false }: {
  kind: PickerKind;
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = value ?? internalValue;
  const [draftDate, setDraftDate] = useState("");
  const [hour, setHour] = useState("00");
  const [minute, setMinute] = useState("00");
  const [clearRequested, setClearRequested] = useState(false);
  const [view, setView] = useState({ year: 2000, month: 0 });
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  function openPicker() {
    const datePart = selectedValue.slice(0, kind === "month" ? 7 : 10);
    const parts = datePart.split("-").map(Number);
    const today = new Date();
    const year = parts[0] || today.getFullYear();
    const month = parts[1] ? parts[1] - 1 : today.getMonth();
    setView({ year, month });
    setDraftDate(datePart);
    setHour(selectedValue.slice(11, 13) || "00");
    setMinute(selectedValue.slice(14, 16) || "00");
    setClearRequested(false);
    setError("");
    dialogRef.current?.showModal();
  }

  function commit(next: string) {
    if (value === undefined) setInternalValue(next);
    onChange?.(next);
    dialogRef.current?.close();
  }

  function confirm() {
    if (clearRequested) {
      commit("");
      return;
    }
    if (!draftDate) {
      setError(kind === "month" ? "Vui lòng chọn tháng." : "Vui lòng chọn ngày.");
      return;
    }
    if (kind === "datetime-local") {
      const hours = Number(hour);
      const minutes = Number(minute);
      if (!/^\d{1,2}$/.test(hour) || !/^\d{1,2}$/.test(minute) || hours > 23 || minutes > 59) {
        setError("Giờ phải từ 00 đến 23 và phút từ 00 đến 59.");
        return;
      }
      commit(`${draftDate}T${pad(hours)}:${pad(minutes)}`);
      return;
    }
    commit(draftDate);
  }

  function move(amount: number) {
    const current = dateAt(view.year, view.month + amount, 1);
    if (current.getFullYear() >= 1 && current.getFullYear() <= 9999) {
      setView({ year: current.getFullYear(), month: current.getMonth() });
    }
  }

  const firstDay = dateAt(view.year, view.month, 1);
  const daysInMonth = dateAt(view.year, view.month + 1, 0).getDate();
  const offset = (firstDay.getDay() + 6) % 7;
  const today = localDate(new Date());
  const currentMonth = `${String(view.year).padStart(4, "0")}-${pad(view.month + 1)}`;

  return <div className="date-picker">
    {name && <input type="hidden" name={name} value={selectedValue} disabled={disabled} />}
    <button className="date-picker__trigger" type="button" aria-label={`${label}: ${dateLabel(selectedValue, kind)}`} disabled={disabled} onClick={openPicker}>
      <span>{dateLabel(selectedValue, kind)}</span><span className="date-picker__trigger-icon" aria-hidden="true">▦</span>
    </button>
    <dialog className="date-picker__dialog" ref={dialogRef} aria-labelledby={titleId}>
      <div className="date-picker__heading">
        <div><span className="date-picker__eyebrow">LỊCH LÀM VIỆC</span><h2 id={titleId}>{label}</h2></div>
        <button type="button" className="date-picker__close" aria-label="Đóng lịch" onClick={() => dialogRef.current?.close()}>×</button>
      </div>
      <div className="date-picker__nav">
        <button type="button" aria-label={kind === "month" ? "Năm trước" : "Tháng trước"} onClick={() => move(kind === "month" ? -12 : -1)}>‹</button>
        <strong>{kind === "month" ? `Năm ${view.year}` : `Tháng ${view.month + 1}, ${view.year}`}</strong>
        <button type="button" aria-label={kind === "month" ? "Năm sau" : "Tháng sau"} onClick={() => move(kind === "month" ? 12 : 1)}>›</button>
      </div>
      {kind === "month" ? <div className="date-picker__months">
        {Array.from({ length: 12 }, (_, index) => {
          const monthValue = `${String(view.year).padStart(4, "0")}-${pad(index + 1)}`;
          return <button type="button" key={monthValue} aria-pressed={draftDate === monthValue} onClick={() => { setDraftDate(monthValue); setClearRequested(false); setError(""); }}>Tháng {index + 1}</button>;
        })}
      </div> : <>
        <div className="date-picker__week" aria-hidden="true">{["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="date-picker__days">
          {Array.from({ length: offset }, (_, index) => <span key={`empty-${index}`} />)}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const date = `${currentMonth}-${pad(index + 1)}`;
            return <button type="button" key={date} aria-label={`Ngày ${index + 1} tháng ${view.month + 1} năm ${view.year}`} aria-pressed={draftDate === date} className={date === today ? "date-picker__today" : undefined} onClick={() => { setDraftDate(date); setClearRequested(false); setError(""); }}>{index + 1}</button>;
          })}
        </div>
      </>}
      {kind === "datetime-local" && <div className="date-picker__time" onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}>
        <label>Giờ<input aria-label="Giờ" type="number" min="0" max="23" value={hour} onChange={(event) => setHour(event.target.value)} /></label>
        <span>:</span>
        <label>Phút<input aria-label="Phút" type="number" min="0" max="59" value={minute} onChange={(event) => setMinute(event.target.value)} /></label>
      </div>}
      {error && <p className="date-picker__error" role="alert">{error}</p>}
      {clearRequested && <p className="date-picker__clear-notice" role="status">Ngày sẽ được xóa khi bạn bấm Áp dụng.</p>}
      <div className="date-picker__actions">
        {kind !== "month" && <button type="button" onClick={() => { setDraftDate(""); setClearRequested(true); setError(""); }}>Xóa ngày</button>}
        <button type="button" onClick={() => { const now = new Date(); setView({ year: now.getFullYear(), month: now.getMonth() }); setDraftDate(kind === "month" ? today.slice(0, 7) : today); setClearRequested(false); setError(""); }}>{kind === "month" ? "Tháng này" : "Hôm nay"}</button>
        <button type="button" className="date-picker__apply" onClick={confirm}>Áp dụng</button>
      </div>
    </dialog>
  </div>;
}

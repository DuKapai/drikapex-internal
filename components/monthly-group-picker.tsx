"use client";

import { useRef } from "react";

type Props = {
  label: string;
  value: string;
  options: string[];
  disabled: boolean;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
};

export default function MonthlyGroupPicker({ label, value, options, disabled, onChange, onSelect }: Props) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  return (
    <div className="monthly__group-picker">
      <label>
        <span>Nhóm công việc</span>
        <input aria-label={label} value={value} maxLength={100} required disabled={disabled}
          placeholder="Nhập tên nhóm hoặc chọn bên cạnh" onChange={(event) => onChange(event.target.value)} />
      </label>
      <details className="monthly__group-picker-menu" ref={menuRef}>
        <summary aria-label={`Chọn ${label}`} aria-disabled={disabled}
          onClick={(event) => { if (disabled) event.preventDefault(); }}>Chọn nhóm <span aria-hidden="true">⌄</span></summary>
        <div className="monthly__group-picker-options">
          <strong>Chọn nhóm công việc</strong>
          {options.map((option) => <button key={option} type="button" disabled={disabled}
            className={option === value ? "monthly__group-option monthly__group-option--selected" : "monthly__group-option"}
            onClick={() => {
              if (menuRef.current) menuRef.current.open = false;
              onSelect(option);
            }}>
            <span>{option}</span>{option === value && <span aria-hidden="true">✓</span>}
          </button>)}
          <small>Để tạo nhóm khác, nhập tên vào ô bên cạnh.</small>
        </div>
      </details>
    </div>
  );
}

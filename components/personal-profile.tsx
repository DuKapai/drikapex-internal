"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { getSafeErrorMessage } from "@/supabase/errors";
import { arePermissionOverridesReady } from "@/supabase/config";
import {
  loadPersonalProfile,
  savePersonalDisplayName,
  type PersonalProfile,
} from "@/supabase/workspace-api";

export default function PersonalProfilePage({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<PersonalProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canEditProfile = arePermissionOverridesReady();

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return null;
      setLoading(true);
      setError(null);
      return loadPersonalProfile(userId);
    }).then((result) => {
      if (!active || !result) return;
      if (result.error) {
        setError(result.error);
      } else if (!result.data) {
        setError("Không tìm thấy hồ sơ tài khoản trong Supabase.");
      } else {
        setProfile(result.data);
        setDisplayName(result.data.display_name ?? "");
        setError(null);
      }
      setLoading(false);
    }).catch((cause: unknown) => {
      if (active) {
        setError(getSafeErrorMessage(cause));
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [userId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditProfile) {
      setError("Chỉnh sửa hồ sơ sẽ khả dụng sau khi trung tâm quyền Supabase được áp dụng.");
      return;
    }
    const normalizedName = displayName.trim();
    if (!normalizedName || normalizedName.length > 80) {
      setError("Tên hiển thị phải có từ 1 đến 80 ký tự.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await savePersonalDisplayName(userId, normalizedName);
      if (result.error) {
        setError(result.error);
      } else if (!result.data) {
        setError("Hồ sơ chưa được cập nhật. Hãy tải lại và thử lại.");
      } else {
        setProfile((current) => current
          ? { ...current, display_name: result.data?.display_name ?? normalizedName }
          : current);
        setDisplayName(result.data.display_name);
        setMessage("Đã lưu tên hiển thị vào Supabase.");
      }
    } catch (cause) {
      setError(getSafeErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="personal-profile" aria-labelledby="personal-profile-title">
      <header className="personal-profile__header">
        <span className="eyebrow">HỒ SƠ CÁ NHÂN · DỮ LIỆU SUPABASE</span>
        <h1 id="personal-profile-title">Thông tin cá nhân</h1>
        <p>Chỉnh tên hiển thị của bạn. Tài khoản và thông tin nhân sự chính thức được quản lý tập trung.</p>
      </header>
      {loading && <p className="data-state" role="status">Đang tải hồ sơ…</p>}
      {error && <p className="inline-message" role="alert">{error}</p>}
      {message && <p className="success-message" role="status">{message}</p>}
      {!loading && profile && (
        <div className="personal-profile__layout">
          <form className="personal-profile__form" onSubmit={(event) => void save(event)}>
            {!canEditProfile && (
              <p className="notice-card" role="status">
                Hồ sơ đang ở chế độ chỉ xem. Hãy áp dụng migration trung tâm quyền để bật lưu tên hiển thị an toàn.
              </p>
            )}
            <label>
              Tên hiển thị
              <input
                autoComplete="name"
                maxLength={80}
                name="display_name"
                readOnly={!canEditProfile}
                onChange={(event) => setDisplayName(event.currentTarget.value)}
                required
                value={displayName}
              />
            </label>
            <label>
              Tên đăng nhập
              <input readOnly value={profile.username ?? "Chưa thiết lập"} />
            </label>
            <label>
              Email nhân sự
              <input readOnly value={profile.employee?.email ?? "Chưa liên kết hồ sơ nhân sự"} />
            </label>
            <button className="button button--primary" disabled={saving || !canEditProfile} type="submit">
              {saving ? "Đang lưu…" : "Lưu thay đổi"}
            </button>
          </form>
          <dl className="personal-profile__details">
            <div><dt>Mã nhân viên</dt><dd>{profile.employee?.employee_code ?? "Chưa liên kết"}</dd></div>
            <div><dt>Họ tên hồ sơ</dt><dd>{profile.employee?.full_name ?? "Chưa có dữ liệu"}</dd></div>
            <div><dt>Chức vụ</dt><dd>{profile.employee?.position ?? "Chưa cập nhật"}</dd></div>
            <div><dt>Tên trong game</dt><dd>{profile.employee?.game_name ?? "Chưa cập nhật"}</dd></div>
            <div><dt>Trạng thái tài khoản</dt><dd>{profile.status}</dd></div>
          </dl>
        </div>
      )}
    </section>
  );
}

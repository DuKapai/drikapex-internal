"use client";

import { useEffect, useState } from "react";
import {
  getEffectivePermissions,
  setUserPermission,
  type EffectivePermission,
} from "@/supabase/permissions-api";
import { getSafeErrorMessage } from "@/supabase/errors";

export default function AccountPermissionOverrides({
  userId,
  isOwner,
  requiresApproval = false,
}: {
  userId: string;
  isOwner: boolean;
  requiresApproval?: boolean;
}) {
  const [permissions, setPermissions] = useState<EffectivePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void getEffectivePermissions(userId).then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError || !data) {
        setError(loadError ? getSafeErrorMessage(loadError) : "Không nhận được danh sách quyền.");
      } else {
        setPermissions(data);
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
  }, [userId, revision]);

  async function change(permission: EffectivePermission, allowed: boolean | null) {
    const nextEffective = allowed ?? permission.role_allowed;
    const needsApproval =
      !isOwner &&
      (requiresApproval ||
        (permission.is_sensitive && permission.allowed && !nextEffective));
    const reason = needsApproval
      ? window.prompt(`Lý do thay đổi quyền ${permission.code} (Owner sẽ duyệt):`)?.trim()
      : null;
    if (needsApproval && !reason) return;
    setWorking(permission.permission_id);
    setError(null);
    setMessage(null);
    try {
      const { data, error: saveError } = await setUserPermission(
        userId,
        permission.permission_id,
        allowed,
        reason ?? null,
      );
      if (saveError) {
        setError(getSafeErrorMessage(saveError));
      } else {
        setMessage(data === "queued"
          ? "Đã gửi yêu cầu; quyền chỉ thay đổi sau khi Owner duyệt."
          : data === "unchanged" ? "Không có thay đổi." : "Đã cập nhật quyền.");
        setRevision((value) => value + 1);
      }
    } catch (cause) {
      setError(getSafeErrorMessage(cause));
    } finally {
      setWorking(null);
    }
  }

  return (
    <section aria-label="Quyền riêng của tài khoản">
      <h3>Quyền riêng</h3>
      <p>Để trống ngoại lệ bằng “Theo vai trò”; quyền riêng sẽ ghi đè quyền mặc định.</p>
      {loading && <p role="status">Đang tải quyền…</p>}
      {error && <p className="inline-message" role="alert">{error}</p>}
      {message && <p className="success-message" role="status">{message}</p>}
      {!loading && !error && (
        <div className="permission-grid">
          {permissions.map((permission) => (
            <div className="permission-card" key={permission.permission_id}>
              <input
                type="checkbox"
                aria-label={`Cho phép ${permission.code}`}
                checked={permission.allowed}
                disabled={
                  working !== null ||
                  permission.source === "inactive" ||
                  permission.target_is_owner
                }
                onChange={(event) => void change(permission, event.currentTarget.checked)}
              />
              <span>
                <strong>{permission.code}</strong>
                <small>
                  Vai trò: {permission.role_allowed ? "có" : "không"} ·
                  Hiệu lực: {permission.allowed ? "có" : "không"}
                </small>
                {permission.is_sensitive && <small>Quyền nhạy cảm · bỏ chọn cần Owner duyệt</small>}
                <small>{permission.override_allowed === null ? "Theo vai trò" : "Quyền riêng"}</small>
                {permission.override_allowed !== null && (
                  <button type="button" className="text-button" disabled={working !== null}
                    onClick={() => void change(permission, null)}>
                    Khôi phục theo vai trò
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

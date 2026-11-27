"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import WorkspaceModule from "@/components/workspace-module";
import AccountPermissionOverrides from "@/components/account-permission-overrides";
import PasswordRecoveryRequests from "@/components/password-recovery-requests";
import { arePermissionOverridesReady } from "@/supabase/config";
import {
  loadAccountDeletionRequests,
  loadProfiles,
  loadRolePermissions,
  type AccountDeletionRequest,
  type DataResult,
  type ProfileRecord,
  type WorkspacePermission,
  type WorkspaceRole,
} from "@/supabase/workspace-api";
import { getSafeErrorMessage } from "@/supabase/errors";
import {
  getPermissionAuditEvents,
  getPermissionChanges,
  getPermissionEnforcement,
  getRoleMembers,
  reviewPermissionChange,
  type PermissionAuditEvent,
  type PermissionChange,
  type PermissionEnforcement,
} from "@/supabase/permissions-api";
import {
  assignAccountRole,
  createAccount,
  deleteAccount as deleteSupabaseAccount,
  executeAccountDeletion,
  removeAccountRole,
  requestAccountDeletion as requestSupabaseAccountDeletion,
  reviewAccountDeletion,
  setRolePermission,
  updateAccountProfile,
  updateAccountStatus,
} from "@/supabase/records-api";

type DashboardSection = "accounts" | "permissions" | "audit";

function isAccountStatus(value: string): value is ProfileRecord["status"] {
  return value === "ACTIVE" || value === "LOCKED" || value === "DISABLED";
}

function useRevision() {
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return { revision, refresh };
}

function useDashboardQuery<T>(
  revision: number,
  load: () => Promise<DataResult<T>>,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (!active) return null;
        setLoading(true);
        setError(null);
        return load();
      })
      .then((result) => {
        if (!active || !result) return;
        setData(result.data);
        setError(result.error);
      })
      .catch((cause: unknown) => {
        if (active) setError(getSafeErrorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load, revision]);

  return { data, error, loading };
}

function DataState({
  loading,
  error,
  empty,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
}) {
  if (loading) {
    return <p className="data-state" role="status">Loading Supabase records…</p>;
  }
  if (error) {
    return <p className="inline-message" role="alert">{error}</p>;
  }
  if (empty) {
    return <p className="data-state">No records were returned for this account.</p>;
  }
  return null;
}

function AccountManagement({
  actorId,
  actorLevel,
  isOwner,
  permissions,
}: {
  actorId: string;
  actorLevel: number;
  isOwner: boolean;
  permissions: string[];
}) {
  const { revision, refresh } = useRevision();
  const load = useCallback(() => loadProfiles(), []);
  const { data: profiles, error, loading } = useDashboardQuery(revision, load);
  const loadRequests = useCallback(
    () => loadAccountDeletionRequests(),
    [],
  );
  const {
    data: deletionRequests,
    error: requestError,
    loading: requestsLoading,
  } = useDashboardQuery(revision, loadRequests);
  const [roles, setRoles] = useState<WorkspaceRole[]>([]);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [permissionTarget, setPermissionTarget] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [designatedOwnerId, setDesignatedOwnerId] = useState<string | null>(null);
  const canManageAccount = isOwner || permissions.includes("users.edit") ||
    permissions.includes("roles.manage") || permissions.includes("personnel.delete");

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => loadRolePermissions())
      .then((result) => {
        if (!active) return;
        if (result.error) {
          setRoleError(result.error);
          return;
        }
        setRoles(result.data?.roles ?? []);
      })
      .catch((cause: unknown) => {
        if (active) setRoleError(getSafeErrorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!arePermissionOverridesReady() || isOwner || !permissions.includes("roles.manage")) return;
    const adminRole = roles.find((role) => role.code === "ADMIN");
    if (!adminRole) return;
    let active = true;
    void getRoleMembers(adminRole.id).then(({ data, error: resultError }) => {
      if (!active) return;
      if (resultError) {
        setRoleError(getSafeErrorMessage(resultError));
      } else {
        setDesignatedOwnerId(data?.find((member) => member.is_owner)?.user_id ?? null);
      }
    }).catch((cause: unknown) => {
      if (active) setRoleError(getSafeErrorMessage(cause));
    });
    return () => { active = false; };
  }, [isOwner, permissions, roles]);

  function mayManage(profile: ProfileRecord): boolean {
    if (!canManageAccount || profile.id === actorId || profile.roles.some((role) => role.code === "OWNER")) return false;
    return isOwner || profile.roles.every((role) => role.id > actorLevel);
  }

  function mayRequestDeletion(profile: ProfileRecord): boolean {
    return !isOwner && actorLevel === 1 && profile.id !== actorId &&
      (mayManage(profile) || (designatedOwnerId !== null && profile.id !== designatedOwnerId));
  }

  async function submitNewAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!arePermissionOverridesReady() || !permissions.includes("users.create") || actorLevel !== 1) {
      setErrorMessage("Bạn không có quyền tạo tài khoản.");
      return;
    }
    const form = event.currentTarget;
    const fields = new FormData(form);
    const email = String(fields.get("email") ?? "").trim();
    const username = String(fields.get("username") ?? "").trim();
    const displayName = String(fields.get("displayName") ?? "").trim();
    const password = String(fields.get("password") ?? "");
    const roleId = Number(fields.get("roleId"));
    if (!roles.some((role) => role.id === roleId && (isOwner || role.id > actorLevel))) {
      setErrorMessage("Chọn vai trò hợp lệ.");
      return;
    }
    setCreating(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      const { data, error: createError } = await createAccount({ email, username, displayName, password, roleId });
      if (createError || !data?.created) {
        if (createError instanceof FunctionsHttpError) {
          const result: unknown = await createError.context.json().catch(() => null);
          setErrorMessage(
            typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
              ? result.error : getSafeErrorMessage(createError),
          );
        } else {
          setErrorMessage(createError ? getSafeErrorMessage(createError) : "Máy chủ chưa xác nhận tạo tài khoản.");
        }
        return;
      }
      form.reset();
      setMessage("Đã tạo tài khoản trên Supabase. Hãy gửi mật khẩu cho nhân viên qua kênh an toàn.");
      refresh();
    } catch (cause) {
      setErrorMessage(getSafeErrorMessage(cause));
    } finally {
      setCreating(false);
    }
  }

  async function saveStatus(
    profile: ProfileRecord,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const statusValue = formData.get("status");
    if (typeof statusValue !== "string" || !isAccountStatus(statusValue)) {
      setErrorMessage("Select a valid account status.");
      return;
    }
    const status = statusValue;
    if (!permissions.includes("users.edit") || !mayManage(profile)) {
      setErrorMessage("Your role cannot change this account.");
      return;
    }
    setWorking(profile.id);
    setErrorMessage(null);
    setMessage(null);
    try {
      const { data, error: updateError } = await updateAccountStatus(
        profile.id,
        status,
      );
      if (updateError) {
        setErrorMessage(getSafeErrorMessage(updateError));
        return;
      }
      if (!data) {
        setErrorMessage("No account was changed. Verify its role and RLS policy.");
        return;
      }
      setMessage(`Account status changed to ${status}.`);
      refresh();
    } catch (cause) {
      setErrorMessage(getSafeErrorMessage(cause));
    } finally {
      setWorking(null);
    }
  }

  async function saveProfile(profile: ProfileRecord, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!permissions.includes("users.edit") || !mayManage(profile)) {
      setErrorMessage("Bạn không có quyền sửa tài khoản này.");
      return;
    }
    const form = event.currentTarget;
    const fields = new FormData(form);
    const username = String(fields.get("username") ?? "").trim().toLowerCase();
    const displayName = String(fields.get("displayName") ?? "").trim();
    if (!/^[a-z0-9._-]{3,64}$/.test(username) || !displayName || displayName.length > 80) {
      setErrorMessage("Tên tài khoản hoặc tên hiển thị không hợp lệ.");
      return;
    }
    setWorking(profile.id);
    setErrorMessage(null);
    setMessage(null);
    try {
      const { data, error: updateError } = await updateAccountProfile(profile.id, {
        username, display_name: displayName,
      });
      if (updateError || !data) {
        setErrorMessage(updateError?.code === "23505"
          ? "Tên tài khoản đã tồn tại."
          : updateError ? getSafeErrorMessage(updateError) : "Không có tài khoản nào được cập nhật.");
        return;
      }
      setMessage("Đã cập nhật hồ sơ tài khoản trên Supabase.");
      refresh();
    } catch (cause) {
      setErrorMessage(getSafeErrorMessage(cause));
    } finally {
      setWorking(null);
    }
  }

  async function assignRole(profile: ProfileRecord, roleId: number) {
    if (!arePermissionOverridesReady()) {
      setErrorMessage("Chưa thể thay đổi vai trò cho đến khi trung tâm quyền được triển khai an toàn.");
      return;
    }
    const role = roles.find((item) => item.id === roleId);
    if (!permissions.includes("roles.manage") || !role || !mayManage(profile) ||
      (!isOwner && role.id <= actorLevel)) {
      setErrorMessage("Your role cannot assign this access level.");
      return;
    }
    const reason = !isOwner
      ? window.prompt(`Lý do đề xuất cấp vai trò ${role.name} (Owner sẽ duyệt):`)?.trim()
      : null;
    if (!isOwner && !reason) return;
    setWorking(profile.id);
    setErrorMessage(null);
    setMessage(null);
    try {
      const { data: assignmentStatus, error: insertError } = await assignAccountRole(
        profile.id,
        role.id,
        reason ?? null,
      );
      if (insertError) {
        setErrorMessage(getSafeErrorMessage(insertError));
        return;
      }
      setMessage(assignmentStatus === "queued"
        ? "Đã gửi yêu cầu thay đổi vai trò; chờ Owner duyệt."
        : `${role.name} access assigned.`);
      refresh();
    } catch (cause) {
      setErrorMessage(getSafeErrorMessage(cause));
    } finally {
      setWorking(null);
    }
  }

  async function removeRole(profile: ProfileRecord, role: WorkspaceRole) {
    if (!arePermissionOverridesReady()) {
      setErrorMessage("Chưa thể thay đổi vai trò cho đến khi trung tâm quyền được triển khai an toàn.");
      return;
    }
    if (
      !mayManage(profile) ||
      !permissions.includes("roles.manage") ||
      (!isOwner && role.id <= actorLevel) ||
      !window.confirm(`Remove ${role.name} access from ${profile.display_name ?? profile.username ?? "this account"}?`)
    ) {
      return;
    }
    const reason = !isOwner
      ? window.prompt(`Lý do đề xuất gỡ vai trò ${role.name} (Owner sẽ duyệt):`)?.trim()
      : null;
    if (!isOwner && !reason) return;
    setWorking(profile.id);
    setErrorMessage(null);
    setMessage(null);
    try {
      const { data: assignmentStatus, error: deleteError } = await removeAccountRole(
        profile.id,
        role.id,
        reason ?? null,
      );
      if (deleteError) {
        setErrorMessage(getSafeErrorMessage(deleteError));
        return;
      }
      setMessage(assignmentStatus === "queued"
        ? "Đã gửi yêu cầu gỡ vai trò; chờ Owner duyệt."
        : `${role.name} access removed.`);
      refresh();
    } catch (cause) {
      setErrorMessage(getSafeErrorMessage(cause));
    } finally {
      setWorking(null);
    }
  }

  async function deleteAccount(profile: ProfileRecord) {
    if (!isOwner || !permissions.includes("personnel.delete") || !mayManage(profile)) {
      setErrorMessage("Only the designated Owner can directly delete accounts.");
      return;
    }
    const accountName =
      profile.display_name || profile.employee?.full_name || profile.username || "this account";
    if (
      !window.confirm(
        `Permanently delete ${accountName} from Supabase Auth? This also removes the linked profile and cannot be undone.`,
      )
    ) {
      return;
    }
    setWorking(profile.id);
    setErrorMessage(null);
    setMessage(null);
    try {
      const { data, error: invokeError } = await deleteSupabaseAccount(
        profile.id,
      );
      if (invokeError) {
        setErrorMessage(getSafeErrorMessage(invokeError));
        return;
      }
      if (!data?.deleted) {
        setErrorMessage("The account deletion was not confirmed by the backend.");
        return;
      }
      if (!data.auditLogged) {
        setErrorMessage(data.warning ?? "Account deleted, but the audit log was not confirmed.");
      } else {
        setMessage("Account deleted and recorded in the audit log.");
      }
      refresh();
    } catch (cause) {
      setErrorMessage(getSafeErrorMessage(cause));
    } finally {
      setWorking(null);
    }
  }

  async function requestAccountDeletion(profile: ProfileRecord) {
    if (!permissions.includes("personnel.delete") || !mayRequestDeletion(profile)) {
      setErrorMessage("Chỉ quản trị viên mới có thể gửi yêu cầu xóa tài khoản khác cho Owner duyệt.");
      return;
    }
    const accountName =
      profile.display_name || profile.employee?.full_name || profile.username || "this account";
    if (!window.confirm(`Send an Owner approval request to delete ${accountName}?`)) {
      return;
    }
    setWorking(profile.id);
    setErrorMessage(null);
    setMessage(null);
    try {
      const { data, error: invokeError } =
        await requestSupabaseAccountDeletion(profile.id);
      if (invokeError) {
        setErrorMessage(getSafeErrorMessage(invokeError));
        return;
      }
      if (data?.request?.status !== "PENDING") {
        setErrorMessage("The server did not confirm the deletion request.");
        return;
      }
      setMessage(`Deletion request sent to the Owner for ${data.targetName ?? accountName}.`);
      refresh();
    } catch (cause) {
      setErrorMessage(getSafeErrorMessage(cause));
    } finally {
      setWorking(null);
    }
  }

  async function reviewDeletionRequest(
    deletionRequest: AccountDeletionRequest,
    action: "approve" | "reject",
  ) {
    if (!isOwner || !permissions.includes("personnel.delete") || deletionRequest.status !== "PENDING") {
      setErrorMessage("Only the designated Owner can review pending deletion requests.");
      return;
    }
    const target = profiles?.find((profile) => profile.id === deletionRequest.target_user_id);
    const targetName =
      target?.display_name || target?.employee?.full_name ||
      target?.username || deletionRequest.target_user_id;
    const verb = action === "approve" ? "approve deletion of" : "reject deletion of";
    if (!window.confirm(`Are you sure you want to ${verb} ${targetName}?`)) return;
    setWorking(String(deletionRequest.id));
    setErrorMessage(null);
    setMessage(null);
    try {
      const { data, error: invokeError } = await reviewAccountDeletion(
        deletionRequest.id,
        action,
      );
      if (invokeError) {
        setErrorMessage(getSafeErrorMessage(invokeError));
        return;
      }
      const expectedStatus = action === "approve" ? "APPROVED" : "REJECTED";
      if (data?.request?.status !== expectedStatus) {
        setErrorMessage("The server did not confirm the review decision.");
        return;
      }
      setMessage(
        action === "approve"
          ? "Request approved. The requesting manager can now execute the deletion."
          : "Deletion request rejected.",
      );
      refresh();
    } catch (cause) {
      setErrorMessage(getSafeErrorMessage(cause));
    } finally {
      setWorking(null);
    }
  }

  async function executeApprovedDeletion(deletionRequest: AccountDeletionRequest) {
    if (
      isOwner ||
      actorLevel !== 1 ||
      !permissions.includes("personnel.delete") ||
      deletionRequest.requested_by !== actorId ||
      deletionRequest.status !== "APPROVED"
    ) {
      setErrorMessage("Only the requesting administrator can execute an approved request.");
      return;
    }
    const target = profiles?.find((profile) => profile.id === deletionRequest.target_user_id);
    const targetName =
      target?.display_name || target?.employee?.full_name ||
      target?.username || deletionRequest.target_user_id;
    if (!window.confirm(`Owner approved this request. Permanently delete ${targetName}?`)) {
      return;
    }
    setWorking(String(deletionRequest.id));
    setErrorMessage(null);
    setMessage(null);
    try {
      const { data, error: invokeError } = await executeAccountDeletion(
        deletionRequest.id,
      );
      if (invokeError) {
        setErrorMessage(getSafeErrorMessage(invokeError));
        return;
      }
      if (!data?.deleted) {
        setErrorMessage("The server did not confirm account deletion.");
        return;
      }
      if (data.warning) {
        setErrorMessage(data.warning);
      } else if (!data.auditLogged) {
        setErrorMessage("The account was deleted, but the audit event was not confirmed.");
      } else {
        setMessage("Account deleted under the Owner-approved request.");
      }
      refresh();
    } catch (cause) {
      setErrorMessage(getSafeErrorMessage(cause));
    } finally {
      setWorking(null);
    }
  }

  return (
    <>
      <div className="module-toolbar">
        <div>
          <span className="eyebrow">USERS · PROFILES · USER_ROLES</span>
          <h2>Account management</h2>
          <p>Manage existing Supabase accounts, profile status and role assignments.</p>
        </div>
        <button className="button button--secondary" disabled={loading} onClick={refresh} type="button">
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div className="notice-card">
        <span className="notice-card__mark" aria-hidden="true">i</span>
        <p>
          {arePermissionOverridesReady()
            ? "Administrators can request account deletion, but only the designated Owner can approve it or directly delete an account. After approval, the requesting administrator can complete the deletion through a protected Supabase Edge Function."
            : "Chức năng đổi vai trò và xóa tài khoản đang tạm khóa trong giao diện; cần triển khai và kiểm tra cơ chế Owner duyệt trên Supabase."}
        </p>
      </div>
      {(errorMessage || roleError) && (
        <p className="inline-message" role="alert">{errorMessage ?? roleError}</p>
      )}
      {message && <p className="success-message" role="status">{message}</p>}
      {arePermissionOverridesReady() && actorLevel === 1 && permissions.includes("users.create") && (
        <details className="account-create">
          <summary>Tạo tài khoản mới</summary>
          <form className="personal-profile__form" onSubmit={(event) => void submitNewAccount(event)}>
            <label>Tên hiển thị<input name="displayName" maxLength={80} required /></label>
            <label>Tên tài khoản<input name="username" pattern="[A-Za-z0-9._-]{3,64}" required /></label>
            <label>Email đăng nhập<input name="email" type="email" maxLength={254} required /></label>
            <label>Mật khẩu ban đầu<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
            <label>Vai trò
              <select name="roleId" defaultValue="" required>
                <option value="" disabled>Chọn vai trò</option>
                {roles.filter((role) => isOwner || role.id > actorLevel).map((role) =>
                  <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </label>
            <p>Chỉ Owner được tạo quản trị viên. Mật khẩu cần được gửi riêng qua kênh an toàn.</p>
            <button className="button button--primary" disabled={creating || !!roleError} type="submit">
              {creating ? "Đang tạo…" : "Tạo tài khoản"}
            </button>
          </form>
        </details>
      )}
      {arePermissionOverridesReady() && isOwner && <PasswordRecoveryRequests />}
      {arePermissionOverridesReady() && (
      <section className="deletion-requests" aria-labelledby="deletion-requests-title">
        <div className="deletion-requests__header">
          <div>
            <span className="eyebrow">{isOwner ? "OWNER · APPROVALS" : "REQUEST STATUS"}</span>
            <h3 id="deletion-requests-title">
              {isOwner
                ? `Account deletion requests${deletionRequests?.some((item) => item.status === "PENDING") ? ` · ${deletionRequests.filter((item) => item.status === "PENDING").length} pending` : ""}`
                : "My deletion requests"}
            </h3>
          </div>
          <button
            className="button button--secondary"
            disabled={requestsLoading}
            onClick={refresh}
            type="button"
          >
            {requestsLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <DataState
          loading={requestsLoading}
          error={requestError}
          empty={!deletionRequests?.length}
        />
        {!!deletionRequests?.length && (
          <div className="deletion-request-list">
            {deletionRequests.map((deletionRequest) => {
              const target = profiles?.find(
                (profile) => profile.id === deletionRequest.target_user_id,
              );
              const requester = profiles?.find(
                (profile) => profile.id === deletionRequest.requested_by,
              );
              const targetName =
                target?.display_name || target?.employee?.full_name ||
                target?.username || deletionRequest.target_user_id;
              const requesterName =
                requester?.display_name || requester?.employee?.full_name ||
                requester?.username || "Manager";
              const statusLabel: Record<AccountDeletionRequest["status"], string> = {
                PENDING: "Pending approval",
                APPROVED: "Approved",
                REJECTED: "Rejected",
                EXECUTING: "Deleting",
                COMPLETED: "Completed",
              };
              return (
                <article className="deletion-request-card" key={deletionRequest.id}>
                  <div className="deletion-request-card__summary">
                    <strong>{targetName}</strong>
                    <span>
                      {isOwner ? `Requested by ${requesterName} · ` : ""}
                      {new Date(deletionRequest.created_at).toLocaleString()}
                    </span>
                  </div>
                  <span className={`record-status record-status--${deletionRequest.status.toLowerCase()}`}>
                    {statusLabel[deletionRequest.status]}
                  </span>
                  <div className="deletion-request-card__actions">
                    {isOwner && deletionRequest.status === "PENDING" && (
                      <>
                        <button
                          className="text-button"
                          disabled={working === String(deletionRequest.id)}
                          onClick={() => void reviewDeletionRequest(deletionRequest, "approve")}
                          type="button"
                        >
                          Approve
                        </button>
                        <button
                          className="text-button text-button--danger"
                          disabled={working === String(deletionRequest.id)}
                          onClick={() => void reviewDeletionRequest(deletionRequest, "reject")}
                          type="button"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {!isOwner &&
                      deletionRequest.requested_by === actorId &&
                      deletionRequest.status === "APPROVED" && (
                        <button
                          className="text-button text-button--danger"
                          disabled={working === String(deletionRequest.id)}
                          onClick={() => void executeApprovedDeletion(deletionRequest)}
                          type="button"
                        >
                          Execute deletion
                        </button>
                      )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      )}
      <DataState loading={loading} error={error} empty={!profiles?.length} />
      {!!profiles?.length && (
        <div className="account-list">
          {profiles.map((profile) => {
            const manageable = mayManage(profile);
            const availableRoles = roles.filter(
              (role) =>
                !profile.roles.some((assigned) => assigned.id === role.id) &&
                (isOwner || role.id > actorLevel),
            );
            const name =
              profile.display_name ||
              profile.employee?.full_name ||
              profile.username ||
              "Unnamed account";
            return (
              <article className="account-card" key={profile.id}>
                <div className="account-card__identity">
                  <span className="account-avatar">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="account-card__name">
                    <strong>{name}</strong>
                    <small>
                      {[
                        profile.employee?.employee_code,
                        profile.employee?.position,
                        profile.employee?.email ?? profile.username ?? profile.id,
                      ].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                  <span className={`record-status record-status--${profile.status.toLowerCase()}`}>
                    {profile.status}
                  </span>
                </div>
                <div className="account-card__access">
                  <div className="account-card__roles">
                    {profile.roles.map((role) => (
                      <span className="role-chip" key={role.id}>
                        {role.code}
                        {arePermissionOverridesReady() && manageable && (isOwner || role.id > actorLevel) && (
                          <button
                            aria-label={`Remove ${role.name} from ${name}`}
                            disabled={working === profile.id}
                            onClick={() => void removeRole(profile, role)}
                            type="button"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                    {profile.roles.length === 0 && (
                      <span className="data-state">No role assigned</span>
                    )}
                  </div>
                  {arePermissionOverridesReady() && manageable && permissions.includes("roles.manage") && availableRoles.length > 0 && (
                    <label className="account-role-select">
                      Assign role
                      <select
                        defaultValue=""
                        disabled={working === profile.id}
                        onChange={(event) => {
                          const roleId = Number(event.currentTarget.value);
                          if (roleId) void assignRole(profile, roleId);
                          event.currentTarget.value = "";
                        }}
                      >
                        <option disabled value="">Choose role</option>
                        {availableRoles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name} · level {role.id}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {manageable && permissions.includes("users.edit") && (
                    <form className="account-status-form" onSubmit={(event) => void saveStatus(profile, event)}>
                      <select
                        aria-label={`Status for ${name}`}
                        defaultValue={profile.status}
                        disabled={working === profile.id}
                        name="status"
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="LOCKED">Locked</option>
                        <option value="DISABLED">Disabled</option>
                      </select>
                      <button className="text-button" disabled={working === profile.id} type="submit">
                        Save status
                      </button>
                    </form>
                  )}
                  {manageable && permissions.includes("roles.manage") && arePermissionOverridesReady() && (
                    <button className="text-button" type="button" onClick={() =>
                      setPermissionTarget(permissionTarget === profile.id ? null : profile.id)}>
                      {permissionTarget === profile.id ? "Đóng quyền riêng" : "Quyền riêng"}
                    </button>
                  )}
                  {arePermissionOverridesReady() && manageable && permissions.includes("personnel.delete") && isOwner && (
                    <button
                      className="text-button text-button--danger account-delete"
                      disabled={working === profile.id}
                      onClick={() => void deleteAccount(profile)}
                      type="button"
                    >
                      Delete account
                    </button>
                  )}
                  {arePermissionOverridesReady() && mayRequestDeletion(profile) && permissions.includes("personnel.delete") && (
                    <button
                      className="text-button text-button--danger account-delete"
                      disabled={working === profile.id}
                      onClick={() => void requestAccountDeletion(profile)}
                      type="button"
                    >
                      Request deletion approval
                    </button>
                  )}
                  {!manageable && profile.id === actorId && (
                    <span className="account-self-label">Your account</span>
                  )}
                  {!manageable && profile.id !== actorId && (
                    <span className="account-self-label">
                      {mayRequestDeletion(profile) ? "Cùng cấp · xóa cần Owner duyệt" : "Cùng cấp hoặc cao hơn · được bảo vệ"}
                    </span>
                  )}
                </div>
                {manageable && permissions.includes("users.edit") && (
                  <details className="account-create">
                    <summary>Sửa thông tin tài khoản</summary>
                    <form className="personal-profile__form" onSubmit={(event) => void saveProfile(profile, event)}>
                      <label>Tên hiển thị<input name="displayName" defaultValue={profile.display_name ?? ""} maxLength={80} required /></label>
                      <label>Tên tài khoản<input name="username" defaultValue={profile.username ?? ""} pattern="[A-Za-z0-9._-]{3,64}" required /></label>
                      <button className="button button--primary" disabled={working === profile.id} type="submit">Lưu thông tin</button>
                    </form>
                  </details>
                )}
                {permissionTarget === profile.id && manageable && permissions.includes("roles.manage") && arePermissionOverridesReady() && (
                  <AccountPermissionOverrides userId={profile.id} isOwner={isOwner} />
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function PermissionManagement({
  actorLevel,
  isOwner,
}: {
  actorLevel: number;
  isOwner: boolean;
}) {
  const { revision, refresh } = useRevision();
  const load = useCallback(() => loadRolePermissions(), []);
  const { data, error, loading } = useDashboardQuery(revision, load);
  const loadProfilesQuery = useCallback(() => loadProfiles(), []);
  const { data: profiles, error: profilesError, loading: profilesLoading } = useDashboardQuery(revision, loadProfilesQuery);
  const [working, setWorking] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<number | null>(null);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<number, {
    user_id: string;
    display_name: string | null;
    username: string | null;
    status: string;
    is_owner: boolean;
  }[]>>({});
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [changes, setChanges] = useState<PermissionChange[]>([]);
  const [changesError, setChangesError] = useState<string | null>(null);
  const [audit, setAudit] = useState<PermissionAuditEvent[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [enforcement, setEnforcement] = useState<PermissionEnforcement[]>([]);
  const [enforcementError, setEnforcementError] = useState<string | null>(null);
  const [oversightLoading, setOversightLoading] = useState(false);
  const roles = useMemo(() => data?.roles ?? [], [data?.roles]);
  const permissions = data?.permissions ?? [];
  const assignments = data?.assignments ?? [];
  const activeRoleId =
    selectedRole ?? roles.find((role) => role.id === 3)?.id ?? roles[0]?.id ?? null;
  const selectedMember = selectedUser
    ? Object.values(members).flat().find((member) => member.user_id === selectedUser) ?? null
    : null;

  useEffect(() => {
    if (!arePermissionOverridesReady() || !roles.length) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return null;
      setMembersLoading(true);
      setMembersError(null);
      return Promise.all(roles.map(async (role) => {
        const { data: rows, error: resultError } = await getRoleMembers(role.id);
        if (resultError) throw resultError;
        return [role.id, rows ?? []] as const;
      }));
    }).then((entries) => {
      if (active && entries) setMembers(Object.fromEntries(entries));
    }).catch((cause: unknown) => {
      if (active) setMembersError(getSafeErrorMessage(cause));
    }).finally(() => {
      if (active) setMembersLoading(false);
    });
    return () => { active = false; };
  }, [revision, roles]);

  useEffect(() => {
    if (!arePermissionOverridesReady()) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return null;
      setOversightLoading(true);
      setChangesError(null);
      setAuditError(null);
      setEnforcementError(null);
      return Promise.all([
        getPermissionChanges(true),
        isOwner ? getPermissionAuditEvents() : Promise.resolve({ data: [], error: null }),
        isOwner ? getPermissionEnforcement() : Promise.resolve({ data: [], error: null }),
      ]);
    }).then((results) => {
      if (!active || !results) return;
      const [changeResult, auditResult, enforcementResult] = results;
      if (changeResult.error) setChangesError(getSafeErrorMessage(changeResult.error));
      else setChanges(changeResult.data ?? []);
      if (auditResult.error) setAuditError(getSafeErrorMessage(auditResult.error));
      else setAudit(auditResult.data ?? []);
      if (enforcementResult.error) setEnforcementError(getSafeErrorMessage(enforcementResult.error));
      else setEnforcement(enforcementResult.data ?? []);
    }).catch((cause: unknown) => {
      if (active) setChangesError(getSafeErrorMessage(cause));
    }).finally(() => {
      if (active) setOversightLoading(false);
    });
    return () => { active = false; };
  }, [revision, isOwner]);

  async function togglePermission(
    permission: WorkspacePermission,
    assigned: boolean,
  ) {
    if (!arePermissionOverridesReady()) {
      setActionError("Trung tâm quyền chưa được triển khai; hiện chỉ có thể xem.");
      return;
    }
    if (!activeRoleId || (!isOwner && actorLevel > 2)) {
      setActionError("Your role cannot modify permissions.");
      return;
    }
    const reason = !isOwner
      ? window.prompt(`Lý do đề xuất thay đổi ${permission.code} (Owner sẽ duyệt):`)?.trim()
      : null;
    if (!isOwner && !reason) return;
    setWorking(permission.id);
    setActionError(null);
    setMessage(null);
    try {
      const { data: resultStatus, error: resultError } = await setRolePermission(
        activeRoleId,
        permission.id,
        assigned,
        reason ?? null,
      );
      if (resultError) {
        setActionError(getSafeErrorMessage(resultError));
        return;
      }
      setMessage(resultStatus === "queued"
        ? `Đã gửi yêu cầu thay đổi ${permission.code}; chờ Owner duyệt.`
        : `${permission.code} đã được cập nhật cho ${roles.find((role) => role.id === activeRoleId)?.name}.`);
      refresh();
    } catch (cause) {
      setActionError(getSafeErrorMessage(cause));
    } finally {
      setWorking(null);
    }
  }

  async function reviewChange(request: PermissionChange, approve: boolean) {
    if (!isOwner || request.status !== "PENDING") return;
    setWorking(-1);
    setActionError(null);
    setMessage(null);
    try {
      const { data, error: reviewError } = await reviewPermissionChange(request.id, approve);
      if (reviewError) {
        setActionError(getSafeErrorMessage(reviewError));
      } else if (data === "stale") {
        setMessage("Yêu cầu đã cũ vì dữ liệu thay đổi; cần tạo yêu cầu mới.");
      } else {
        setMessage(approve ? "Đã duyệt yêu cầu." : "Đã từ chối yêu cầu.");
      }
      refresh();
    } catch (cause) {
      setActionError(getSafeErrorMessage(cause));
    } finally {
      setWorking(null);
    }
  }

  const ownerMembers = Object.values(members).flat().filter((member) => member.is_owner);
  const memberName = (userId: string) => {
    const member = Object.values(members).flat().find((item) => item.user_id === userId);
    return member?.display_name || member?.username || profiles?.find((profile) => profile.id === userId)?.display_name ||
      profiles?.find((profile) => profile.id === userId)?.username || "Nhân viên";
  };

  return (
    <>
      <div className="module-toolbar">
        <div>
          <span className="eyebrow">OWNER · ROLE GROUPS · INDIVIDUAL ACCESS</span>
          <h2>Permission control center</h2>
          <p>{arePermissionOverridesReady()
            ? "Owner is separate from the shared Administrator role; effective access is enforced by Supabase."
            : "Xem vai trò và quyền đang được lưu trong Supabase."}</p>
        </div>
        <button className="button button--secondary" disabled={loading} onClick={refresh} type="button">
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <DataState loading={loading} error={error} empty={!roles.length || !permissions.length} />
      {!arePermissionOverridesReady() && <p className="inline-message" role="status">
        Đang ở chế độ chỉ xem. Cần triển khai và kiểm tra trung tâm quyền trên Supabase trước khi chỉnh sửa hoặc duyệt quyền.
      </p>}
      {data && (
        <>
          <div className="permission-center">
            <section className="permission-center__roster" aria-label="Nhân sự theo nhóm quyền">
              <h3>Nhóm quyền và nhân sự</h3>
              {membersLoading && <p role="status">Đang tải nhân sự…</p>}
              {membersError && <p className="inline-message" role="alert">{membersError}</p>}
              {!arePermissionOverridesReady() && profilesLoading && <p role="status">Đang tải nhân sự…</p>}
              {!arePermissionOverridesReady() && profilesError && <p className="inline-message" role="alert">{profilesError}</p>}
              {arePermissionOverridesReady() && ownerMembers.map((member) => (
                <article className="role-tab role-tab--owner" key={member.user_id}>
                  <span>OWNER</span>
                  <strong>{member.display_name || member.username || "Owner"}</strong>
                  <small>Toàn quyền · quản lý và duyệt duy nhất</small>
                </article>
              ))}
              {roles.map((role) => {
                const roleMembers = arePermissionOverridesReady()
                  ? (members[role.id] ?? []).filter((member) => !member.is_owner)
                  : (profiles ?? []).filter((profile) => profile.roles.some((item) => item.id === role.id))
                    .map((profile) => ({
                      user_id: profile.id,
                      display_name: profile.display_name,
                      username: profile.username,
                      status: profile.status,
                      is_owner: false,
                    }));
                return (
                  <section className="permission-center__group" key={role.id}>
                    <button
                      aria-pressed={activeRoleId === role.id}
                      className={`role-tab${activeRoleId === role.id ? " role-tab--active" : ""}`}
                      onClick={() => setSelectedRole(role.id)}
                      type="button"
                    >
                      <span>{role.code === "ADMIN" ? "ADMINISTRATOR" : role.code}</span>
                      <strong>{role.name}</strong>
                      <small>{!arePermissionOverridesReady() && (profilesLoading || profilesError)
                        ? "Chưa xác định số nhân sự"
                        : `${roleMembers.length} nhân sự`}</small>
                    </button>
                    {roleMembers.map((member) => (
                      <button
                        aria-pressed={selectedUser === member.user_id}
                        className="permission-center__member"
                        disabled={!arePermissionOverridesReady()}
                        key={member.user_id}
                        onClick={() => setSelectedUser(member.user_id)}
                        type="button"
                      >
                        <span>{member.display_name || member.username || "Nhân viên"}</span>
                        <small>{member.status}</small>
                      </button>
                    ))}
                  </section>
                );
              })}
            </section>
            <div className="permission-center__details">
              {selectedUser && selectedMember && arePermissionOverridesReady() && (
                <section className="permission-center__individual">
                  <h3>Quyền riêng · {memberName(selectedUser)}</h3>
                  <AccountPermissionOverrides
                    isOwner={isOwner}
                    requiresApproval={!isOwner && roles.find((role) =>
                      (members[role.id] ?? []).some((member) =>
                        member.user_id === selectedUser && role.id === 1,
                      ),
                    ) !== undefined}
                    userId={selectedUser}
                  />
                </section>
              )}
              <section className="permission-center__role-defaults">
                <h3>Quyền mặc định theo vai trò</h3>
                <p>{!arePermissionOverridesReady()
                  ? "Quyền hiện tại được đọc từ Supabase; chức năng thay đổi đang tạm khóa."
                  : isOwner
                  ? "Owner có thể áp dụng thay đổi trực tiếp."
                  : "Thay đổi mặc định ảnh hưởng toàn nhóm và sẽ chờ Owner duyệt."}</p>
                <div className="permission-grid" aria-label="Danh sách quyền mặc định">
                  {permissions.map((permission) => {
                    const assigned = assignments.some((entry) =>
                      entry.role_id === activeRoleId && entry.permission_id === permission.id,
                    );
                    return (
                      <label className="permission-card" key={permission.id}>
                        <input
                          checked={assigned}
                          disabled={working !== null || !arePermissionOverridesReady()}
                          onChange={() => void togglePermission(permission, assigned)}
                          type="checkbox"
                        />
                        <span>
                          <strong>{permission.code}</strong>
                          <small>{permission.name}</small>
                          {permission.description && <small>{permission.description}</small>}
                          {permission.is_sensitive && <small>Nhạy cảm · Owner giám sát</small>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
          {actionError && <p className="inline-message" role="alert">{actionError}</p>}
          {message && <p className="success-message" role="status">{message}</p>}
          {arePermissionOverridesReady() && (
            <section className="permission-center__oversight">
              <div>
                <h3>Yêu cầu thay đổi quyền {isOwner ? "· Owner duyệt" : "· Yêu cầu của tôi"}</h3>
                {changesError && <p className="inline-message" role="alert">{changesError}</p>}
                {oversightLoading && <p role="status">Đang tải hàng đợi…</p>}
                {!changesError && changes.length === 0 && <p>Chưa có yêu cầu quyền.</p>}
                {changes.map((request) => (
                  <article className="deletion-request-card" key={request.id}>
                    <div className="deletion-request-card__summary">
                      <strong>{request.permission_name} · {request.permission_code}</strong>
                      <span>
                        {request.target_name
                          ? `${request.target_name} · `
                          : ""}{request.target_role_name ?? ""}
                        {request.requested_by_name ? ` · Gửi bởi ${request.requested_by_name}` : ""}
                      </span>
                      {request.reason && <small>Lý do: {request.reason}</small>}
                    </div>
                    <span className={`record-status record-status--${request.status.toLowerCase()}`}>
                      {request.status}
                    </span>
                    {isOwner && request.status === "PENDING" && (
                      <div className="deletion-request-card__actions">
                        <button className="text-button" disabled={working !== null}
                          onClick={() => void reviewChange(request, true)} type="button">Duyệt</button>
                        <button className="text-button text-button--danger" disabled={working !== null}
                          onClick={() => void reviewChange(request, false)} type="button">Từ chối</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              {isOwner && (
                <>
                  <div>
                    <h3>Nhật ký thay đổi quyền</h3>
                    {auditError && <p className="inline-message" role="alert">{auditError}</p>}
                    {audit.map((event) => (
                      <article className="deletion-request-card" key={event.id}>
                        <div className="deletion-request-card__summary">
                          <strong>{event.action} · {event.permission_code ?? event.role_name ?? "Quyền"}</strong>
                          <span>{event.actor_name ?? "Tài khoản không còn tồn tại"} · {event.target_name ?? event.role_name ?? ""}</span>
                          {event.details && <small>{event.details}</small>}
                        </div>
                        <time>{new Date(event.created_at).toLocaleString()}</time>
                      </article>
                    ))}
                  </div>
                  <div>
                    <h3>Enforcement map · RLS / RPC / Edge Functions</h3>
                    {enforcementError && <p className="inline-message" role="alert">{enforcementError}</p>}
                    <div className="permission-enforcement-list">
                      {enforcement.map((item) => (
                        <details key={item.code}>
                          <summary>{item.code}{item.is_sensitive ? " · Nhạy cảm" : ""}</summary>
                          <p>{item.name}</p>
                          <p>RLS: {item.rls_policies.join(", ") || "Chưa ánh xạ"}</p>
                          <p>RPC: {item.routines.join(", ") || "Chưa ánh xạ"}</p>
                          <p>Edge: {item.edge_functions.join(", ") || "Chưa ánh xạ"}</p>
                        </details>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}

export default function DashboardAdmin({
  section,
  actorId,
  actorLevel,
  isOwner,
  permissions,
}: {
  section: DashboardSection;
  actorId: string;
  actorLevel: number;
  isOwner: boolean;
  permissions: string[];
}) {
  if (section === "audit") {
    return <WorkspaceModule permissions={permissions} userId={actorId} view="audit" />;
  }
  if (section === "permissions") {
    return <PermissionManagement actorLevel={actorLevel} isOwner={isOwner} />;
  }
  return (
    <AccountManagement
      actorId={actorId}
      actorLevel={actorLevel}
      isOwner={isOwner}
      permissions={permissions}
    />
  );
}

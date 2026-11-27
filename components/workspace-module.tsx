"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import DatePicker from "@/components/date-picker";
import {
  loadAuditLogs,
  loadDocuments,
  loadEmployees,
  loadNotifications,
  loadProfiles,
  type AuditLogRecord,
  type DataResult,
  type DocumentRecord,
  type EmployeeRecord,
  type NotificationRecord,
  type ProfileRecord,
} from "@/supabase/workspace-api";
import { getSafeErrorMessage } from "@/supabase/errors";
import {
  deleteDocumentRecord,
  deleteEmployeeRecord,
  deleteNotificationRecord,
  loadDocumentCategories,
  markNotificationRead,
  saveDocumentRecord,
  saveEmployeeRecord,
  saveNotificationRecord,
} from "@/supabase/records-api";

export type WorkspaceModuleId =
  | "people"
  | "documents"
  | "notifications"
  | "administration"
  | "audit";

type Props = {
  view: WorkspaceModuleId;
  userId: string;
  permissions: string[];
};

const moduleInfo: Record<
  WorkspaceModuleId,
  { title: string; description: string; permission: string }
> = {
  people: {
    title: "People",
    description: "Employee records from the existing personnel directory.",
    permission: "personnel.view",
  },
  documents: {
    title: "Documents",
    description:
      "Document metadata from the existing catalog. File upload and download require a configured Supabase Storage bucket and policies.",
    permission: "documents.view",
  },
  notifications: {
    title: "Notifications",
    description: "Internal updates and your personal read status.",
    permission: "notifications.view",
  },
  administration: {
    title: "Accounts and access",
    description:
      "Existing account profiles and assigned role names. Account provisioning and role changes require a protected backend function.",
    permission: "users.view",
  },
  audit: {
    title: "Audit log",
    description:
      "Read-only history from the existing audit_logs table. Trusted event creation must run in a database trigger or protected backend.",
    permission: "audit.view",
  },
};

function ModuleHeader({
  view,
  count,
  onRefresh,
  refreshing,
}: {
  view: WorkspaceModuleId;
  count: number | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const info = moduleInfo[view];
  return (
    <div className="module-toolbar">
      <div>
        <span className="eyebrow">{info.permission}</span>
        <h2>{count === null ? info.title : `${info.title} · ${count}`}</h2>
        <p>{info.description}</p>
      </div>
      <button
        className="button button--secondary"
        disabled={refreshing}
        onClick={onRefresh}
        type="button"
      >
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}

function QueryMessage({
  loading,
  error,
  empty,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
}) {
  if (loading) {
    return <p className="data-state" role="status">Loading database records…</p>;
  }
  if (error) {
    return <p className="inline-message" role="alert">{error}</p>;
  }
  if (empty) {
    return <p className="data-state">No records are visible to your account.</p>;
  }
  return null;
}

function useAccess(permissions: string[], permission: string): boolean {
  return permissions.includes(permission);
}

function useRefresh() {
  const [revision, setRevision] = useState(0);
  return { revision, refresh: () => setRevision((value) => value + 1) };
}

function useQuery<T>(
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

function isEmployeeStatus(
  value: string,
): value is EmployeeRecord["status"] {
  return ["ACTIVE", "INACTIVE", "SUSPENDED"].includes(value);
}

function EmployeeModule({
  permissions,
}: {
  permissions: string[];
}) {
  const { revision, refresh } = useRefresh();
  const load = useCallback(() => loadEmployees(), []);
  const { data: employees, error, loading } = useQuery(revision, load);
  const [editing, setEditing] = useState<EmployeeRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const canCreate = useAccess(permissions, "personnel.create");
  const canEdit = useAccess(permissions, "personnel.edit");
  const canDelete = useAccess(permissions, "personnel.delete");

  async function saveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setActionMessage(null);
    const formData = new FormData(event.currentTarget);
    const employeeCode = String(formData.get("employee_code") ?? "").trim();
    const fullName = String(formData.get("full_name") ?? "").trim();
    const status = String(formData.get("status") ?? "ACTIVE");
    if (!employeeCode || !fullName || !isEmployeeStatus(status)) {
      setActionError("Enter an employee code, name, and valid status.");
      return;
    }

    const values = {
      employee_code: employeeCode,
      full_name: fullName,
      email: String(formData.get("email") ?? "").trim() || null,
      position: String(formData.get("position") ?? "").trim() || null,
      status,
      updated_at: new Date().toISOString(),
    };
    setBusy(true);
    try {
      const result = await saveEmployeeRecord(editing?.id ?? null, values);
      if (result.error) {
        setActionError(getSafeErrorMessage(result.error));
        return;
      }
      if (!result.data) {
        setActionError("No employee was changed. Check your access and try again.");
        return;
      }
      setEditing(null);
      setActionMessage(editing ? "Employee updated." : "Employee created.");
      refresh();
    } catch (cause) {
      setActionError(getSafeErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function deleteEmployee(employee: EmployeeRecord) {
    if (
      !window.confirm(
        `Delete employee ${employee.full_name}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setActionError(null);
    setActionMessage(null);
    setBusy(true);
    try {
      const { data, error: deleteError } = await deleteEmployeeRecord(employee.id);
      if (deleteError) {
        setActionError(getSafeErrorMessage(deleteError));
        return;
      }
      if (!data) {
        setActionError("No employee was deleted. Check your access and try again.");
        return;
      }
      setActionMessage("Employee deleted.");
      refresh();
    } catch (cause) {
      setActionError(getSafeErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ModuleHeader
        count={employees?.length ?? null}
        onRefresh={refresh}
        refreshing={loading}
        view="people"
      />
      {(canCreate || (canEdit && editing)) && (
        <form className="data-form" key={editing?.id ?? "new"} onSubmit={saveEmployee}>
          <h3>{editing ? "Edit employee" : "Add employee"}</h3>
          <div className="data-form__grid">
            <label>
              Employee code
              <input
                defaultValue={editing?.employee_code ?? ""}
                maxLength={50}
                name="employee_code"
                required
              />
            </label>
            <label>
              Full name
              <input
                defaultValue={editing?.full_name ?? ""}
                maxLength={150}
                name="full_name"
                required
              />
            </label>
            <label>
              Work email
              <input
                defaultValue={editing?.email ?? ""}
                maxLength={255}
                name="email"
                type="email"
              />
            </label>
            <label>
              Position
              <input
                defaultValue={editing?.position ?? ""}
                maxLength={150}
                name="position"
              />
            </label>
            <label>
              Status
              <select defaultValue={editing?.status ?? "ACTIVE"} name="status">
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </label>
          </div>
          <div className="data-form__actions">
            <button className="button button--primary" disabled={busy} type="submit">
              {busy ? "Saving…" : editing ? "Save changes" : "Create employee"}
            </button>
            {editing && (
              <button
                className="button button--secondary"
                onClick={() => setEditing(null)}
                type="button"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
      {actionError && <p className="inline-message" role="alert">{actionError}</p>}
      {actionMessage && <p className="success-message" role="status">{actionMessage}</p>}
      <QueryMessage loading={loading} error={error} empty={!employees?.length} />
      {!!employees?.length && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Code</th>
                <th>Position</th>
                <th>Status</th>
                {(canEdit || canDelete) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    <strong>{employee.full_name}</strong>
                    <small>{employee.email || employee.game_name || "—"}</small>
                  </td>
                  <td>{employee.employee_code}</td>
                  <td>{employee.position || "—"}</td>
                  <td><span className={`record-status record-status--${employee.status.toLowerCase()}`}>{employee.status}</span></td>
                  {(canEdit || canDelete) && (
                    <td className="data-table__actions">
                      {canEdit && (
                        <button className="text-button" onClick={() => setEditing(employee)} type="button">
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button className="text-button text-button--danger" disabled={busy} onClick={() => void deleteEmployee(employee)} type="button">
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="module-footnote">Writes are also enforced by the database RLS policies; interface permissions are not a security boundary.</p>
    </>
  );
}

function DocumentModule({
  userId,
  permissions,
}: {
  userId: string;
  permissions: string[];
}) {
  const { revision, refresh } = useRefresh();
  const load = useCallback(() => loadDocuments(), []);
  const { data: documents, error, loading } = useQuery(revision, load);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [editing, setEditing] = useState<DocumentRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const canCreate = useAccess(permissions, "documents.create");
  const canEdit = useAccess(permissions, "documents.edit");
  const canDelete = useAccess(permissions, "documents.delete");

  useEffect(() => {
    if (!canCreate && !canEdit) return;
    let active = true;
    void Promise.resolve()
      .then(() => loadDocumentCategories())
      .then(({ data, error: categoryError }) => {
        if (!active) return;
        if (categoryError) {
          setActionError(getSafeErrorMessage(categoryError));
          return;
        }
        setCategories(data ?? []);
      })
      .catch((cause: unknown) => {
        if (active) setActionError(getSafeErrorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [canCreate, canEdit]);

  async function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setActionMessage(null);
    const formData = new FormData(event.currentTarget);
    const documentCode = String(formData.get("document_code") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const categoryId = Number(formData.get("category_id"));
    const status = String(formData.get("status") ?? "DRAFT");
    if (!documentCode || !title || !Number.isInteger(categoryId) || categoryId <= 0 ||
      !["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)) {
      setActionError("Enter a document code, title, category, and valid status.");
      return;
    }

    const values = {
      document_code: documentCode,
      title,
      category_id: categoryId,
      description: String(formData.get("description") ?? "").trim() || null,
      status,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    setBusy(true);
    try {
      const result = await saveDocumentRecord(
        editing?.id ?? null,
        userId,
        values,
      );
      if (result.error) {
        setActionError(getSafeErrorMessage(result.error));
        return;
      }
      if (!result.data) {
        setActionError("No document was changed. Check your access and try again.");
        return;
      }
      setEditing(null);
      setActionMessage(editing ? "Document updated." : "Document created.");
      refresh();
    } catch (cause) {
      setActionError(getSafeErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocument(document: DocumentRecord) {
    if (
      !window.confirm(
        `Delete document ${document.title}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setActionError(null);
    setActionMessage(null);
    setBusy(true);
    try {
      const { data, error: deleteError } = await deleteDocumentRecord(document.id);
      if (deleteError) {
        setActionError(getSafeErrorMessage(deleteError));
        return;
      }
      if (!data) {
        setActionError("No document was deleted. Check your access and try again.");
        return;
      }
      setActionMessage("Document deleted.");
      refresh();
    } catch (cause) {
      setActionError(getSafeErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ModuleHeader count={documents?.length ?? null} onRefresh={refresh} refreshing={loading} view="documents" />
      {(canCreate || (canEdit && editing)) && categories.length > 0 && (
        <form className="data-form" key={editing?.id ?? "new"} onSubmit={saveDocument}>
          <h3>{editing ? "Edit document" : "Add document metadata"}</h3>
          <div className="data-form__grid">
            <label>Document code<input defaultValue={editing?.document_code ?? ""} maxLength={100} name="document_code" required /></label>
            <label>Title<input defaultValue={editing?.title ?? ""} maxLength={255} name="title" required /></label>
            <label>Category<select defaultValue={editing?.category_id ?? ""} name="category_id" required><option disabled value="">Select a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label>Status<select defaultValue={editing?.status ?? "DRAFT"} name="status"><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select></label>
            <label className="data-form__wide">Description<textarea defaultValue={editing?.description ?? ""} name="description" rows={3} /></label>
          </div>
          <div className="data-form__actions">
            <button className="button button--primary" disabled={busy} type="submit">{busy ? "Saving…" : editing ? "Save changes" : "Create document"}</button>
            {editing && <button className="button button--secondary" onClick={() => setEditing(null)} type="button">Cancel</button>}
          </div>
        </form>
      )}
      {(canCreate || canEdit) && categories.length === 0 && !loading && !actionError && (
        <p className="notice-card">No document categories are available. Add a category in the existing database before creating documents.</p>
      )}
      {actionError && <p className="inline-message" role="alert">{actionError}</p>}
      {actionMessage && <p className="success-message" role="status">{actionMessage}</p>}
      <QueryMessage loading={loading} error={error} empty={!documents?.length} />
      {!!documents?.length && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Document</th><th>Category</th><th>File</th><th>Status</th>{(canEdit || canDelete) && <th>Actions</th>}</tr></thead>
            <tbody>{documents.map((document) => (
              <tr key={document.id}>
                <td><strong>{document.title}</strong><small>{document.document_code}</small></td>
                <td>{document.document_categories[0]?.name ?? "—"}</td>
                <td>{document.file_name ?? "Metadata only"}</td>
                <td><span className={`record-status record-status--${document.status.toLowerCase()}`}>{document.status}</span></td>
                {(canEdit || canDelete) && <td className="data-table__actions">
                  {canEdit && <button className="text-button" onClick={() => setEditing(document)} type="button">Edit</button>}
                  {canDelete && <button className="text-button text-button--danger" disabled={busy} onClick={() => void deleteDocument(document)} type="button">Delete</button>}
                </td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p className="module-footnote">This module manages database metadata only. It does not upload or expose document files.</p>
    </>
  );
}

function isPriority(value: string): value is NotificationRecord["priority"] {
  return ["LOW", "NORMAL", "HIGH", "URGENT"].includes(value);
}

function NotificationsModule({
  userId,
  permissions,
}: {
  userId: string;
  permissions: string[];
}) {
  const { revision, refresh } = useRefresh();
  const load = useCallback(
    () => loadNotifications(userId),
    [userId],
  );
  const { data, error, loading } = useQuery(revision, load);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const canCreate = useAccess(permissions, "notifications.create");
  const canEdit = useAccess(permissions, "notifications.edit");
  const canDelete = useAccess(permissions, "notifications.delete");

  async function saveNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setActionMessage(null);
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "").trim();
    const content = String(formData.get("content") ?? "").trim();
    const priority = String(formData.get("priority") ?? "NORMAL");
    const expiresValue = String(formData.get("expires_at") ?? "");
    if (!title || !content || !isPriority(priority)) {
      setActionError("Enter a title, message, and valid priority.");
      return;
    }
    const expiresDate = expiresValue ? new Date(expiresValue) : null;
    if (expiresDate && Number.isNaN(expiresDate.getTime())) {
      setActionError("Choose a valid notification expiry date.");
      return;
    }
    const expiresAt = expiresDate?.toISOString() ?? null;
    const values = {
      title,
      content,
      priority,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };
    setBusy(true);
    try {
      const result = await saveNotificationRecord(
        editingId,
        userId,
        values,
      );
      if (result.error) {
        setActionError(getSafeErrorMessage(result.error));
        return;
      }
      if (!result.data) {
        setActionError("No notification was changed. Check your access and try again.");
        return;
      }
      setEditingId(null);
      setActionMessage(editingId ? "Notification updated." : "Notification published.");
      refresh();
    } catch (cause) {
      setActionError(getSafeErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function markAsRead(notificationId: number) {
    setActionError(null);
    setActionMessage(null);
    setBusy(true);
    try {
      const { error: readError } = await markNotificationRead(
        notificationId,
        userId,
      );
      if (readError) {
        setActionError(getSafeErrorMessage(readError));
        return;
      }
      setActionMessage("Notification marked as read.");
      refresh();
    } catch (cause) {
      setActionError(getSafeErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function deleteNotification(notification: NotificationRecord) {
    if (
      !window.confirm(
        `Delete notification ${notification.title}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setActionError(null);
    setActionMessage(null);
    setBusy(true);
    try {
      const { data, error: deleteError } = await deleteNotificationRecord(
        notification.id,
      );
      if (deleteError) {
        setActionError(getSafeErrorMessage(deleteError));
        return;
      }
      if (!data) {
        setActionError("No notification was deleted. Check your access and try again.");
        return;
      }
      setActionMessage("Notification deleted.");
      refresh();
    } catch (cause) {
      setActionError(getSafeErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ModuleHeader count={data?.notifications.length ?? null} onRefresh={refresh} refreshing={loading} view="notifications" />
      {(canCreate || (canEdit && editingId !== null)) && (
        <form className="data-form" key={editingId ?? "new"} onSubmit={saveNotification}>
          <h3>{editingId ? "Edit notification" : "Publish a notification"}</h3>
          <div className="data-form__grid">
            <label>Title<input defaultValue={data?.notifications.find((item) => item.id === editingId)?.title ?? ""} maxLength={255} name="title" required /></label>
            <label>Priority<select defaultValue={data?.notifications.find((item) => item.id === editingId)?.priority ?? "NORMAL"} name="priority"><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
            <label className="data-form__wide">Message<textarea defaultValue={data?.notifications.find((item) => item.id === editingId)?.content ?? ""} name="content" required rows={3} /></label>
            <div className="data-form__date-field"><span>Expires at</span><DatePicker label="Thời gian hết hạn" kind="datetime-local" defaultValue={data?.notifications.find((item) => item.id === editingId)?.expires_at?.slice(0, 16) ?? ""} name="expires_at" /></div>
          </div>
          <div className="data-form__actions">
            <button className="button button--primary" disabled={busy} type="submit">{busy ? "Saving…" : editingId ? "Save changes" : "Publish notification"}</button>
            {editingId && <button className="button button--secondary" onClick={() => setEditingId(null)} type="button">Cancel</button>}
          </div>
        </form>
      )}
      {actionError && <p className="inline-message" role="alert">{actionError}</p>}
      {actionMessage && <p className="success-message" role="status">{actionMessage}</p>}
      <QueryMessage loading={loading} error={error} empty={!data?.notifications.length} />
      {!!data?.notifications.length && (
        <div className="notification-list">
          {data.notifications.map((notification) => {
            const read = data.readIds.includes(String(notification.id));
            const editing = editingId === notification.id;
            return (
              <article className={`notification-card${read ? "" : " notification-card--unread"}`} key={notification.id}>
                <div className="notification-card__header">
                  <div><span className={`record-status record-status--${notification.priority.toLowerCase()}`}>{notification.priority}</span><h3>{notification.title}</h3></div>
                  <time dateTime={notification.created_at}>{new Date(notification.created_at).toLocaleDateString()}</time>
                </div>
                <p>{notification.content}</p>
                <div className="data-table__actions">
                  {!read && <button className="text-button" disabled={busy} onClick={() => void markAsRead(notification.id)} type="button">Mark as read</button>}
                  {canEdit && <button className="text-button" onClick={() => setEditingId(editing ? null : notification.id)} type="button">{editing ? "Stop editing" : "Edit"}</button>}
                  {canDelete && <button className="text-button text-button--danger" disabled={busy} onClick={() => void deleteNotification(notification)} type="button">Delete</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="module-footnote">Read status is saved per authenticated user in notification_reads.</p>
    </>
  );
}

function AdministrationModule({ permissions }: { permissions: string[] }) {
  const { revision, refresh } = useRefresh();
  const load = useCallback(() => loadProfiles(), []);
  const { data: profiles, error, loading } = useQuery(revision, load);
  return (
    <>
      <ModuleHeader count={profiles?.length ?? null} onRefresh={refresh} refreshing={loading} view="administration" />
      <p className="notice-card">
        Creating Auth users, disabling access, assigning roles, and resetting passwords are not done in the browser. The schema requires a protected Supabase Edge Function with server-side authorization.
      </p>
      <QueryMessage loading={loading} error={error} empty={!profiles?.length} />
      {!!profiles?.length && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Account</th><th>Username</th><th>Employee ID</th><th>Status</th><th>Roles</th></tr></thead>
            <tbody>{profiles.map((profile: ProfileRecord) => (
              <tr key={profile.id}>
                <td><strong>{profile.display_name || "Unnamed account"}</strong></td>
                <td>{profile.username || "—"}</td>
                <td>{profile.employee_id ?? "—"}</td>
                <td><span className={`record-status record-status--${profile.status.toLowerCase()}`}>{profile.status}</span></td>
                <td>{profile.roles.length ? profile.roles.join(", ") : "No role assigned"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {permissions.includes("roles.view") && (
        <p className="module-footnote">Role definitions and permission mappings are enforced in the database. Role editing is not enabled in this static browser client.</p>
      )}
    </>
  );
}

function AuditModule() {
  const { revision, refresh } = useRefresh();
  const load = useCallback(() => loadAuditLogs(), []);
  const { data: entries, error, loading } = useQuery(revision, load);
  return (
    <>
      <ModuleHeader
        count={entries?.length ?? null}
        onRefresh={refresh}
        refreshing={loading}
        view="audit"
      />
      <QueryMessage loading={loading} error={error} empty={!entries?.length} />
      {!!entries?.length && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Module</th>
                <th>Target</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry: AuditLogRecord) => (
                <tr key={entry.id}>
                  <td>
                    <time dateTime={entry.created_at}>
                      {new Date(entry.created_at).toLocaleString()}
                    </time>
                  </td>
                  <td>{entry.action}</td>
                  <td>{entry.module ?? "—"}</td>
                  <td>
                    {entry.target_type
                      ? `${entry.target_type}${entry.target_id ? ` #${entry.target_id}` : ""}`
                      : "—"}
                  </td>
                  <td>{entry.description ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="module-footnote">
        This view does not create audit records. Do not write trusted audit
        events from the browser client.
      </p>
    </>
  );
}

export default function WorkspaceModule({ view, userId, permissions }: Props) {
  const requiredPermission = moduleInfo[view].permission;
  if (!permissions.includes(requiredPermission)) {
    return (
      <section className="module-page">
        <div className="page-title-block">
          <span className="eyebrow">{requiredPermission}</span>
          <h1>{moduleInfo[view].title}</h1>
        </div>
        <p className="notice-card" role="status">
          Your account does not have the permission required for this module. Ask an administrator to assign the appropriate role. Database RLS remains the authoritative access control.
        </p>
      </section>
    );
  }

  return (
    <section className="module-page">
      {view === "people" && <EmployeeModule permissions={permissions} />}
      {view === "documents" && <DocumentModule userId={userId} permissions={permissions} />}
      {view === "notifications" && <NotificationsModule userId={userId} permissions={permissions} />}
      {view === "administration" && <AdministrationModule permissions={permissions} />}
      {view === "audit" && <AuditModule />}
    </section>
  );
}

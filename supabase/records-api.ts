import { getSupabaseClient } from "@/supabase/client";
import { arePermissionOverridesReady } from "@/supabase/config";
import { setRoleDefault, setUserRole } from "@/supabase/permissions-api";

type EmployeeValues = {
  employee_code: string;
  full_name: string;
  email: string | null;
  position: string | null;
  status: string;
  updated_at: string;
};

type DocumentValues = {
  document_code: string;
  title: string;
  category_id: number;
  description: string | null;
  status: string;
  updated_by: string;
  updated_at: string;
};

type NotificationValues = {
  title: string;
  content: string;
  priority: string;
  expires_at: string | null;
  updated_at: string;
};

export function saveEmployeeRecord(id: number | null, values: EmployeeValues) {
  const client = getSupabaseClient();
  return id === null
    ? client.from("employees").insert(values).select("id").maybeSingle()
    : client.from("employees").update(values).eq("id", id).select("id").maybeSingle();
}

export function deleteEmployeeRecord(id: number) {
  return getSupabaseClient()
    .from("employees")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
}

export function loadDocumentCategories() {
  return getSupabaseClient()
    .from("document_categories")
    .select("id,name")
    .order("name");
}

export function saveDocumentRecord(
  id: number | null,
  userId: string,
  values: DocumentValues,
) {
  const client = getSupabaseClient();
  return id === null
    ? client
        .from("documents")
        .insert({ ...values, created_by: userId })
        .select("id")
        .maybeSingle()
    : client
        .from("documents")
        .update(values)
        .eq("id", id)
        .select("id")
        .maybeSingle();
}

export function deleteDocumentRecord(id: number) {
  return getSupabaseClient()
    .from("documents")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
}

export function saveNotificationRecord(
  id: number | null,
  userId: string,
  values: NotificationValues,
) {
  const client = getSupabaseClient();
  return id === null
    ? client
        .from("notifications")
        .insert({ ...values, created_by: userId })
        .select("id")
        .maybeSingle()
    : client
        .from("notifications")
        .update(values)
        .eq("id", id)
        .select("id")
        .maybeSingle();
}

export function markNotificationRead(notificationId: number, userId: string) {
  return getSupabaseClient()
    .from("notification_reads")
    .upsert(
      { notification_id: notificationId, user_id: userId },
      { onConflict: "notification_id,user_id", ignoreDuplicates: true },
    );
}

export function deleteNotificationRecord(id: number) {
  return getSupabaseClient()
    .from("notifications")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
}

export function updateAccountStatus(
  userId: string,
  status: "ACTIVE" | "LOCKED" | "DISABLED",
) {
  return getSupabaseClient()
    .from("profiles")
    .update({ status })
    .eq("id", userId)
    .select("id")
    .maybeSingle();
}

export function updateAccountProfile(userId: string, values: { display_name: string; username: string }) {
  return getSupabaseClient()
    .from("profiles")
    .update(values)
    .eq("id", userId)
    .select("id")
    .maybeSingle();
}

export function createAccount(values: {
  email: string;
  password: string;
  username: string;
  displayName: string;
  roleId: number;
}) {
  return getSupabaseClient().functions.invoke<{ created?: boolean; userId?: string }>(
    "create-account", { body: values },
  );
}

export function assignAccountRole(userId: string, roleId: number, reason: string | null = null) {
  if (arePermissionOverridesReady()) return setUserRole(userId, roleId, true, reason);
  return getSupabaseClient()
    .from("user_roles")
    .insert({ user_id: userId, role_id: roleId });
}

export function removeAccountRole(userId: string, roleId: number, reason: string | null = null) {
  if (arePermissionOverridesReady()) return setUserRole(userId, roleId, false, reason);
  return getSupabaseClient()
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role_id", roleId);
}

export function setRolePermission(
  roleId: number,
  permissionId: number,
  assigned: boolean,
  reason: string | null = null,
) {
  if (arePermissionOverridesReady()) {
    return setRoleDefault(roleId, permissionId, !assigned, reason);
  }
  const query = getSupabaseClient().from("role_permissions");
  return assigned
    ? query.delete().eq("role_id", roleId).eq("permission_id", permissionId)
    : query.insert({ role_id: roleId, permission_id: permissionId });
}

export function deleteAccount(userId: string) {
  return getSupabaseClient().functions.invoke<{
    deleted?: boolean;
    auditLogged?: boolean;
    warning?: string;
  }>("delete-account", { body: { userId } });
}

export function requestAccountDeletion(targetUserId: string) {
  return getSupabaseClient().functions.invoke<{
    request?: { status: string };
    targetName?: string;
  }>("account-deletion-workflow", {
    body: { action: "request", targetUserId },
  });
}

export function reviewAccountDeletion(
  requestId: number,
  action: "approve" | "reject",
) {
  return getSupabaseClient().functions.invoke<{
    request?: { status: string };
  }>("account-deletion-workflow", {
    body: { action, requestId },
  });
}

export function executeAccountDeletion(requestId: number) {
  return getSupabaseClient().functions.invoke<{
    deleted?: boolean;
    auditLogged?: boolean;
    warning?: string;
  }>("account-deletion-workflow", {
    body: { action: "execute", requestId },
  });
}

import { getSupabaseClient } from "@/supabase/client";

export type EffectivePermission = {
  permission_id: number;
  code: string;
  name: string;
  description: string | null;
  is_sensitive: boolean;
  allowed: boolean;
  source: "inactive" | "override" | "role" | "none";
  role_allowed: boolean;
  override_allowed: boolean | null;
  target_is_owner: boolean;
};

export type PermissionChange = {
  id: string;
  change_kind: "user_override" | "role_default" | "user_role";
  permission_code: string;
  permission_name: string;
  target_user_id: string | null;
  target_name: string | null;
  target_role_id: number | null;
  target_role_name: string | null;
  desired_allowed: boolean | null;
  requested_by_name: string | null;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "STALE";
  created_at: string;
};

export type PermissionAuditEvent = {
  id: number;
  actor_name: string | null;
  target_name: string | null;
  role_name: string | null;
  permission_code: string | null;
  action: string;
  previous_allowed: boolean | null;
  requested_allowed: boolean | null;
  details: string | null;
  created_at: string;
};

export type PermissionEnforcement = {
  code: string;
  name: string;
  is_sensitive: boolean;
  rls_policies: string[];
  routines: string[];
  edge_functions: string[];
};

export type PermissionCatalogEntry = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_sensitive: boolean;
};

/** Omit userId for the caller; inspecting another user requires a higher role. */
export async function getEffectivePermissions(userId?: string) {
  const result = await getSupabaseClient().rpc("drikapex_effective_permissions", {
    p_user_id: userId ?? null,
  });
  return { ...result, data: result.data as EffectivePermission[] | null };
}

/** Null removes an override and restores the union of role defaults. */
export function setUserPermission(
  userId: string,
  permissionId: number,
  allowed: boolean | null,
  reason: string | null = null,
) {
  return getSupabaseClient().rpc("drikapex_set_user_permission", {
    p_user_id: userId,
    p_permission_id: permissionId,
    p_allowed: allowed,
    p_reason: reason,
  });
}

export function setRoleDefault(
  roleId: number,
  permissionId: number,
  allowed: boolean,
  reason: string | null = null,
) {
  return getSupabaseClient().rpc("drikapex_set_role_permission", {
    p_role_id: roleId,
    p_permission_id: permissionId,
    p_allowed: allowed,
    p_reason: reason,
  });
}

export function setUserRole(
  userId: string,
  roleId: number,
  assigned: boolean,
  reason: string | null = null,
) {
  return getSupabaseClient().rpc("drikapex_set_user_role", {
    p_user_id: userId,
    p_role_id: roleId,
    p_assigned: assigned,
    p_reason: reason,
  });
}

export async function getIsOwner() {
  const result = await getSupabaseClient().rpc("drikapex_is_owner");
  return { ...result, data: result.data as boolean | null };
}

export async function getRoleMembers(roleId: number) {
  const result = await getSupabaseClient().rpc("drikapex_role_members", {
    p_role_id: roleId,
  });
  return { ...result, data: result.data as {
    user_id: string;
    display_name: string | null;
    username: string | null;
    status: string;
    is_owner: boolean;
  }[] | null };
}

export async function getPermissionCatalog() {
  const result = await getSupabaseClient().rpc("drikapex_permission_catalog");
  return { ...result, data: result.data as PermissionCatalogEntry[] | null };
}

export async function getPermissionChanges(includeDecided = false) {
  const result = await getSupabaseClient().rpc("drikapex_list_permission_changes", {
    p_include_decided: includeDecided,
  });
  return { ...result, data: result.data as PermissionChange[] | null };
}

export function reviewPermissionChange(id: string, approve: boolean) {
  return getSupabaseClient().rpc("drikapex_review_permission_change", {
    p_id: id,
    p_approve: approve,
  });
}

export async function getPermissionAuditEvents(limit = 100) {
  const result = await getSupabaseClient().rpc("drikapex_permission_audit_events", {
    p_limit: limit,
  });
  return { ...result, data: result.data as PermissionAuditEvent[] | null };
}

export async function getPermissionEnforcement() {
  const result = await getSupabaseClient().rpc("drikapex_permission_enforcement");
  return { ...result, data: result.data as PermissionEnforcement[] | null };
}

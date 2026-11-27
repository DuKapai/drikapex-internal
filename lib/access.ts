import type { WorkspaceRole } from "@/supabase/workspace-api";
import { arePermissionOverridesReady } from "../supabase/config";

export function getRoleLandingPath(roles: WorkspaceRole[], permissionControlReady = arePermissionOverridesReady()): string | null {
  if (roles.length === 0) return null;
  return canAccessDashboard(roles, permissionControlReady) ? "/dashboard/" : "/office/";
}

export function canAccessDashboard(roles: WorkspaceRole[], permissionControlReady = arePermissionOverridesReady()): boolean {
  return roles.some((role) => role.id <= (permissionControlReady ? 1 : 2));
}

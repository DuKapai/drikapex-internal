import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/supabase/client", () => ({
  getSupabaseClient: () => ({ rpc }),
}));

import {
  getIsOwner,
  getPermissionChanges,
  getPermissionEnforcement,
  getPermissionAuditEvents,
  getEffectivePermissions,
  getRoleMembers,
  reviewPermissionChange,
  setRoleDefault,
  setUserPermission,
  setUserRole,
} from "../supabase/permissions-api";

beforeEach(() => {
  rpc.mockReset();
});

describe("permissions RPC client", () => {
  it("requests own or a specified user's effective permissions and preserves errors", async () => {
    const error = { message: "not authorized" };
    rpc.mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error });

    expect(await getEffectivePermissions()).toEqual({ data: [], error: null });
    expect(await getEffectivePermissions("target")).toEqual({ data: null, error });
    expect(rpc.mock.calls).toEqual([
      ["drikapex_effective_permissions", { p_user_id: null }],
      ["drikapex_effective_permissions", { p_user_id: "target" }],
    ]);
  });

  it("passes deny, grant, and override removal without conflating them", () => {
    for (const value of [false, true, null]) {
      setUserPermission("target", 7, value);
    }
    expect(rpc.mock.calls).toEqual([false, true, null].map((value) => [
      "drikapex_set_user_permission",
      { p_user_id: "target", p_permission_id: 7, p_allowed: value, p_reason: null },
    ]));
  });

  it("passes explicit role-default and role-assignment operations", () => {
    setRoleDefault(3, 7, true);
    setUserRole("target", 3, false);
    expect(rpc.mock.calls).toEqual([
      ["drikapex_set_role_permission", {
        p_role_id: 3, p_permission_id: 7, p_allowed: true, p_reason: null,
      }],
      ["drikapex_set_user_role", {
        p_user_id: "target", p_role_id: 3, p_assigned: false, p_reason: null,
      }],
    ]);
  });

  it("passes approval reasons and central oversight RPCs", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    setUserPermission("target", 7, false, "Sensitive change");
    setRoleDefault(3, 7, false, "Group change");
    setUserRole("target", 3, true, "Role change");
    reviewPermissionChange("request-id", true);
    await getIsOwner();
    await getRoleMembers(3);
    await getPermissionChanges(true);
    await getPermissionAuditEvents(50);
    await getPermissionEnforcement();

    expect(rpc.mock.calls).toEqual([
      ["drikapex_set_user_permission", {
        p_user_id: "target", p_permission_id: 7, p_allowed: false, p_reason: "Sensitive change",
      }],
      ["drikapex_set_role_permission", {
        p_role_id: 3, p_permission_id: 7, p_allowed: false, p_reason: "Group change",
      }],
      ["drikapex_set_user_role", {
        p_user_id: "target", p_role_id: 3, p_assigned: true, p_reason: "Role change",
      }],
      ["drikapex_review_permission_change", { p_id: "request-id", p_approve: true }],
      ["drikapex_is_owner"],
      ["drikapex_role_members", { p_role_id: 3 }],
      ["drikapex_list_permission_changes", { p_include_decided: true }],
      ["drikapex_permission_audit_events", { p_limit: 50 }],
      ["drikapex_permission_enforcement"],
    ]);
  });
});

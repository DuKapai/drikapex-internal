import { getSafeErrorMessage } from "@/supabase/errors";
import { getSupabaseClient } from "@/supabase/client";
import { arePermissionOverridesReady } from "@/supabase/config";
import {
  getEffectivePermissions,
  getIsOwner,
  getPermissionCatalog,
} from "@/supabase/permissions-api";

export type EmployeeRecord = {
  id: number;
  employee_code: string;
  full_name: string;
  game_name: string | null;
  email: string | null;
  position: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
};

export type DocumentRecord = {
  id: number;
  document_code: string;
  title: string;
  category_id: number;
  description: string | null;
  file_name: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  document_categories: { name: string; code: string }[];
};

export type NotificationRecord = {
  id: number;
  title: string;
  content: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  expires_at: string | null;
  created_at: string;
};

export type ProfileRecord = {
  id: string;
  employee_id: number | null;
  display_name: string | null;
  username: string | null;
  status: "ACTIVE" | "LOCKED" | "DISABLED";
  employee: {
    employee_code: string;
    full_name: string;
    game_name: string | null;
    email: string | null;
    position: string | null;
  } | null;
  roles: WorkspaceRole[];
};

export type PersonalProfile = {
  id: string;
  employee_id: number | null;
  display_name: string | null;
  username: string | null;
  status: ProfileRecord["status"];
  employee: Pick<EmployeeRecord, "employee_code" | "full_name" | "game_name" | "email" | "position"> | null;
};

export type AuditLogRecord = {
  id: number;
  action: string;
  module: string | null;
  target_type: string | null;
  target_id: string | null;
  description: string | null;
  created_at: string;
};

export type AccountDeletionRequest = {
  id: number;
  requested_by: string;
  target_user_id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXECUTING" | "COMPLETED";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type OfficeMember = {
  id: string;
  employeeId: number | null;
  name: string;
  username: string | null;
  position: string;
  avatarUrl: string | null;
};

export type WorkspaceProfile = Pick<
  ProfileRecord,
  "employee_id" | "display_name" | "username" | "status"
>;

export type WorkspaceRole = {
  id: number;
  code: string;
  name: string;
};

export type WorkspacePermission = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_sensitive?: boolean;
};

export type DataResult<T> = {
  data: T | null;
  error: string | null;
};

type QueryError = { code?: unknown; status?: unknown };

async function readQuery<T>(
  request: PromiseLike<{ data: T | null; error: QueryError | null }>,
): Promise<DataResult<T>> {
  try {
    const { data, error } = await request;
    if (error) {
      return { data: null, error: getSafeErrorMessage(error) };
    }
    return { data, error: null };
  } catch (error) {
    return { data: null, error: getSafeErrorMessage(error) };
  }
}

export async function loadEmployees(
): Promise<DataResult<EmployeeRecord[]>> {
  const client = getSupabaseClient();
  return readQuery(
    client
      .from("employees")
      .select(
        "id,employee_code,full_name,game_name,email,position,status",
      )
      .order("full_name", { ascending: true }),
  );
}

export async function loadDocuments(
): Promise<DataResult<DocumentRecord[]>> {
  const client = getSupabaseClient();
  return readQuery(
    client
      .from("documents")
      .select(
        "id,document_code,title,category_id,description,file_name,status,document_categories(name,code)",
      )
      .order("created_at", { ascending: false }),
  );
}

export async function loadNotifications(
  userId: string,
): Promise<
  DataResult<{ notifications: NotificationRecord[]; readIds: string[] }>
> {
  const client = getSupabaseClient();
  const [notifications, reads] = await Promise.all([
    readQuery<NotificationRecord[]>(
      client
        .from("notifications")
        .select("id,title,content,priority,expires_at,created_at")
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("created_at", { ascending: false }),
    ),
    readQuery<{ notification_id: number }[]>(
      client
        .from("notification_reads")
        .select("notification_id")
        .eq("user_id", userId),
    ),
  ]);

  if (notifications.error) {
    return { data: null, error: notifications.error };
  }
  if (reads.error) {
    return { data: null, error: reads.error };
  }

  return {
    data: {
      notifications: notifications.data ?? [],
      readIds: (reads.data ?? []).map((row) => String(row.notification_id)),
    },
    error: null,
  };
}

export async function loadWorkspaceIdentity(
  userId: string,
): Promise<
  DataResult<{
    profile: WorkspaceProfile | null;
    roles: WorkspaceRole[];
    permissions: string[];
    isOwner: boolean;
  }>
> {
  const client = getSupabaseClient();
  const profileResult = await readQuery<WorkspaceProfile>(
    client
      .from("profiles")
      .select("employee_id,display_name,username,status")
      .eq("id", userId)
      .maybeSingle(),
  );
  if (profileResult.error) {
    return { data: null, error: profileResult.error };
  }
  if (!profileResult.data || profileResult.data.status !== "ACTIVE") {
    return {
      data: {
        profile: profileResult.data,
        roles: [],
        permissions: [],
        isOwner: false,
      },
      error: null,
    };
  }

  const assignmentsResult = await readQuery<{ role_id: number }[]>(
    client
      .from("user_roles")
      .select("role_id")
      .eq("user_id", userId),
  );
  if (assignmentsResult.error) {
    return { data: null, error: assignmentsResult.error };
  }
  const roleIds = (assignmentsResult.data ?? []).map((assignment) => assignment.role_id);
  if (roleIds.length === 0) {
    return {
      data: { profile: profileResult.data, roles: [], permissions: [], isOwner: false },
      error: null,
    };
  }
  const [rolesResult, rolePermissionsResult] = await Promise.all([
    readQuery<WorkspaceRole[]>(
      client.from("roles").select("id,code,name").in("id", roleIds),
    ),
    readQuery<{ permission_id: number }[]>(
      client.from("role_permissions").select("permission_id").in("role_id", roleIds),
    ),
  ]);
  if (rolesResult.error) return { data: null, error: rolesResult.error };
  if (rolePermissionsResult.error) {
    return { data: null, error: rolePermissionsResult.error };
  }
  if (arePermissionOverridesReady()) {
    try {
      const { data: effective, error } = await getEffectivePermissions();
      if (error) return { data: null, error: getSafeErrorMessage(error) };
      if (!effective) return { data: null, error: "Could not load effective permissions." };
      const { data: isOwner, error: ownerError } = await getIsOwner();
      if (ownerError) return { data: null, error: getSafeErrorMessage(ownerError) };
      return {
        data: {
          profile: profileResult.data,
          roles: rolesResult.data ?? [],
          permissions: effective.filter((item) => item.allowed).map((item) => item.code),
          isOwner: isOwner === true,
        },
        error: null,
      };
    } catch (error) {
      return { data: null, error: getSafeErrorMessage(error) };
    }
  }
  const permissionIds = (rolePermissionsResult.data ?? []).map(
    (assignment) => assignment.permission_id,
  );
  const permissionResult = permissionIds.length
    ? await readQuery<{ code: string }[]>(
        client.from("permissions").select("code").in("id", permissionIds),
      )
    : { data: [] as { code: string }[], error: null };
  if (permissionResult.error) {
    return { data: null, error: permissionResult.error };
  }

  return {
    data: {
      profile: profileResult.data,
      roles: rolesResult.data ?? [],
      permissions: [...new Set((permissionResult.data ?? []).map((item) => item.code))],
      isOwner: false,
    },
    error: null,
  };
}

export async function loadProfiles(
): Promise<DataResult<ProfileRecord[]>> {
  const client = getSupabaseClient();
  const profilesResult = await readQuery<
    Omit<ProfileRecord, "roles" | "employee">[]
  >(
    client
      .from("profiles")
      .select("id,employee_id,display_name,username,status")
      .order("display_name", { ascending: true }),
  );
  if (profilesResult.error) {
    return { data: null, error: profilesResult.error };
  }
  const profiles = profilesResult.data ?? [];
  if (profiles.length === 0) {
    return { data: [], error: null };
  }

  const employeeIds = [
    ...new Set(
      profiles
        .map((profile) => profile.employee_id)
        .filter((employeeId): employeeId is number => employeeId !== null),
    ),
  ];
  const [employeeResult, assignmentsResult] = await Promise.all([
    employeeIds.length
    ? readQuery<{
        id: number;
        employee_code: string;
        full_name: string;
        game_name: string | null;
        email: string | null;
        position: string | null;
      }[]>(
          client
            .from("employees")
          .select("id,employee_code,full_name,game_name,email,position")
            .in("id", employeeIds),
        )
      : Promise.resolve({
        data: [] as {
          id: number;
          employee_code: string;
          full_name: string;
          game_name: string | null;
          email: string | null;
          position: string | null;
        }[],
          error: null,
        }),
    readQuery<{ user_id: string; role_id: number }[]>(
      client
        .from("user_roles")
        .select("user_id,role_id")
        .in("user_id", profiles.map((profile) => profile.id)),
    ),
  ]);
  if (employeeResult.error) return { data: null, error: employeeResult.error };
  if (assignmentsResult.error) {
    return { data: null, error: assignmentsResult.error };
  }
  const roleIds = [
    ...new Set((assignmentsResult.data ?? []).map((assignment) => assignment.role_id)),
  ];
  const roleResult = roleIds.length
    ? await readQuery<WorkspaceRole[]>(
        client.from("roles").select("id,code,name").in("id", roleIds),
      )
    : { data: [] as WorkspaceRole[], error: null };
  if (roleResult.error) return { data: null, error: roleResult.error };
  const roleById = new Map((roleResult.data ?? []).map((role) => [role.id, role]));

  const rolesByUser = new Map<string, WorkspaceRole[]>();
  for (const assignment of assignmentsResult.data ?? []) {
    const role = roleById.get(assignment.role_id);
    if (!role) continue;
    const current = rolesByUser.get(assignment.user_id) ?? [];
    current.push(role);
    rolesByUser.set(assignment.user_id, current);
  }
  const employeeById = new Map(
    (employeeResult.data ?? []).map((employee) => [employee.id, employee]),
  );

  return {
    data: profiles.map((profile) => ({
      ...profile,
      employee:
        profile.employee_id === null
          ? null
          : employeeById.get(profile.employee_id) ?? null,
      roles: rolesByUser.get(profile.id) ?? [],
    })),
    error: null,
  };
}

export async function loadAccountDeletionRequests(
): Promise<DataResult<AccountDeletionRequest[]>> {
  const client = getSupabaseClient();
  return readQuery(
    client
      .from("account_deletion_requests")
      .select(
        "id,requested_by,target_user_id,status,reviewed_by,reviewed_at,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100),
  );
}

export async function loadPersonalProfile(
  userId: string,
): Promise<DataResult<PersonalProfile | null>> {
  const client = getSupabaseClient();
  const profileResult = await readQuery<Omit<PersonalProfile, "employee">>(
    client
      .from("profiles")
      .select("id,employee_id,display_name,username,status")
      .eq("id", userId)
      .maybeSingle(),
  );
  if (profileResult.error) return { data: null, error: profileResult.error };
  if (!profileResult.data || profileResult.data.employee_id === null) {
    return {
      data: profileResult.data ? { ...profileResult.data, employee: null } : null,
      error: null,
    };
  }
  const employeeResult = await readQuery<PersonalProfile["employee"]>(
    client
      .from("employees")
      .select("employee_code,full_name,game_name,email,position")
      .eq("id", profileResult.data.employee_id)
      .maybeSingle(),
  );
  if (employeeResult.error) return { data: null, error: employeeResult.error };
  return {
    data: { ...profileResult.data, employee: employeeResult.data },
    error: null,
  };
}

export async function savePersonalDisplayName(userId: string, displayName: string) {
  const client = getSupabaseClient();
  return readQuery<{ id: string; display_name: string } | null>(
    client
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", userId)
      .select("id,display_name")
      .maybeSingle(),
  );
}

export async function loadAuditLogs(
): Promise<DataResult<AuditLogRecord[]>> {
  const client = getSupabaseClient();
  return readQuery(
    client
      .from("audit_logs")
      .select(
        "id,action,module,target_type,target_id,description,created_at",
      )
      .order("created_at", { ascending: false }),
  );
}

export async function loadOfficeMembers(
): Promise<DataResult<OfficeMember[]>> {
  const client = getSupabaseClient();
  const [profiles, employees] = await Promise.all([
    readQuery<
      {
        id: string;
        employee_id: number | null;
        display_name: string | null;
        username: string | null;
        status: "ACTIVE" | "LOCKED" | "DISABLED";
      }[]
    >(
      client
        .from("profiles")
        .select("id,employee_id,display_name,username,status")
        .eq("status", "ACTIVE")
        .order("display_name", { ascending: true })
        .limit(40),
    ),
    readQuery<
      {
        id: number;
        full_name: string;
        position: string | null;
        avatar_url: string | null;
        status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
      }[]
    >(
      client
        .from("employees")
        .select("id,full_name,position,avatar_url,status")
        .eq("status", "ACTIVE")
        .order("full_name", { ascending: true })
        .limit(40),
    ),
  ]);
  if (profiles.error) return { data: null, error: profiles.error };
  if (employees.error) return { data: null, error: employees.error };

  const employeeById = new Map(
    (employees.data ?? []).map((employee) => [employee.id, employee]),
  );
  return {
    data: (profiles.data ?? []).map((profile) => {
      const employee =
        profile.employee_id === null
          ? undefined
          : employeeById.get(profile.employee_id);
      return {
        id: profile.id,
        employeeId: profile.employee_id,
        name:
          profile.display_name?.trim() ||
          employee?.full_name ||
          profile.username ||
          "Workspace member",
        username: profile.username,
        position: employee?.position || "Workspace member",
        avatarUrl: employee?.avatar_url ?? null,
      };
    }),
    error: null,
  };
}

export async function loadRolePermissions(
): Promise<
  DataResult<{
    roles: WorkspaceRole[];
    permissions: WorkspacePermission[];
    assignments: { role_id: number; permission_id: number }[];
  }>
> {
  const client = getSupabaseClient();
  const permissionControlReady = arePermissionOverridesReady();
  const [roles, permissions, assignments] = await Promise.all([
    readQuery<WorkspaceRole[]>(
      client.from("roles").select("id,code,name").order("id"),
    ),
    readQuery<WorkspacePermission[]>(
      client
        .from("permissions")
        .select("id,code,name,description")
        .order("code"),
    ),
    readQuery<{ role_id: number; permission_id: number }[]>(
      client.from("role_permissions").select("role_id,permission_id"),
    ),
  ]);
  if (roles.error) return { data: null, error: roles.error };
  if (permissions.error) return { data: null, error: permissions.error };
  if (assignments.error) return { data: null, error: assignments.error };
  let permissionRows = permissions.data ?? [];
  if (permissionControlReady) {
    try {
      const { data: catalog, error: catalogError } = await getPermissionCatalog();
      if (catalogError) return { data: null, error: getSafeErrorMessage(catalogError) };
      if (!catalog) return { data: null, error: "Could not load permission metadata." };
      permissionRows = catalog;
    } catch (error) {
      return { data: null, error: getSafeErrorMessage(error) };
    }
  }
  return {
    data: {
      roles: roles.data ?? [],
      permissions: permissionRows,
      assignments: assignments.data ?? [],
    },
    error: null,
  };
}

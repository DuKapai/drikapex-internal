export interface Employee {
  id: number;
  employee_code: string;
  full_name: string;
  game_name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  status: string;
  join_date: string | null;
}

export interface DocumentRecord {
  id: number;
  document_code: string;
  title: string;
  status: string;
  file_name: string | null;
  created_at: string;
}

export interface NotificationRecord {
  id: number;
  title: string;
  content: string;
  priority: string;
  expires_at: string | null;
  created_at: string;
}

export interface ProfileRecord {
  id: string;
  employee_id: number | null;
  display_name: string | null;
  username: string | null;
  status: string;
}

export interface RoleRecord {
  id: number;
  code: string;
  name: string;
  description: string | null;
}

export interface PermissionRecord {
  id: number;
  code: string;
  name: string;
}

export interface AuditLogRecord {
  id: number;
  user_id: string | null;
  action: string;
  module: string | null;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
}

export interface DashboardData {
  employees: Employee[];
  documents: DocumentRecord[];
  notifications: NotificationRecord[];
  profiles: ProfileRecord[];
  roles: RoleRecord[];
  permissions: PermissionRecord[];
  auditLogs: AuditLogRecord[];
  userRolesCount: number;
  rolePermissionsCount: number;
  notificationReadsCount: number;
}

export interface ManagedAccount {
  employeeId: number;
  employeeCode: string;
  fullName: string;
  email: string | null;
  employeeStatus: string;
  userId: string | null;
  username: string | null;
  profileStatus: string | null;
  roleCodes: string[];
}
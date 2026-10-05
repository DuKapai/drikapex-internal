import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { AuditLogRecord, DashboardData, DocumentRecord, Employee, ManagedAccount, NotificationRecord, PermissionRecord, ProfileRecord, RoleRecord } from '../models/dashboard.model';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient | null = this.createClient();

  get isConfigured(): boolean {
    return this.client !== null;
  }

  async loadDashboard(): Promise<DashboardData> {
    if (!this.client) {
      return { employees: [], documents: [], notifications: [], profiles: [], roles: [], permissions: [], auditLogs: [], userRolesCount: 0, rolePermissionsCount: 0, notificationReadsCount: 0 };
    }

    const [employees, documents, notifications, profiles, roles, permissions, auditLogs, userRoles, rolePermissions, notificationReads] = await Promise.all([
      this.client.from('employees').select('id, employee_code, full_name, game_name, email, phone, position, status, join_date').order('created_at', { ascending: false }),
      this.client.from('documents').select('id, document_code, title, status, file_name, created_at').order('created_at', { ascending: false }),
      this.client.from('notifications').select('id, title, content, priority, expires_at, created_at').order('created_at', { ascending: false }),
      this.client.from('profiles').select('id, employee_id, display_name, username, status').order('created_at', { ascending: false }),
      this.client.from('roles').select('id, code, name, description').order('name'),
      this.client.from('permissions').select('id, code, name').order('code'),
      this.client.from('audit_logs').select('id, user_id, action, module, target_type, target_id, created_at').order('created_at', { ascending: false }).limit(25),
      this.client.from('user_roles').select('user_id', { count: 'exact', head: true }),
      this.client.from('role_permissions').select('role_id', { count: 'exact', head: true }),
      this.client.from('notification_reads').select('user_id', { count: 'exact', head: true })
    ]);

    const results = [employees, documents, notifications, profiles, roles, permissions, auditLogs, userRoles, rolePermissions, notificationReads];
    results.filter((result) => result.error).forEach((result) => console.warn('Supabase table could not be loaded:', result.error?.message));

    return {
      employees: (employees.data ?? []) as Employee[],
      documents: (documents.data ?? []) as DocumentRecord[],
      notifications: (notifications.data ?? []) as NotificationRecord[],
      profiles: (profiles.data ?? []) as ProfileRecord[],
      roles: (roles.data ?? []) as RoleRecord[],
      permissions: (permissions.data ?? []) as PermissionRecord[],
      auditLogs: (auditLogs.data ?? []) as AuditLogRecord[],
      userRolesCount: userRoles.count ?? 0,
      rolePermissionsCount: rolePermissions.count ?? 0,
      notificationReadsCount: notificationReads.count ?? 0
    };
  }

  async loadManagedAccounts(): Promise<ManagedAccount[]> {
    if (!this.client) {
      throw new Error('Supabase chưa được cấu hình.');
    }

    const [employees, profiles, userRoles, roles] = await Promise.all([
      this.client.from('employees').select('id, employee_code, full_name, email, status').order('full_name'),
      this.client.from('profiles').select('id, employee_id, username, status'),
      this.client.from('user_roles').select('user_id, role_id'),
      this.client.from('roles').select('id, code')
    ]);
    const error = employees.error ?? profiles.error ?? userRoles.error ?? roles.error;
    if (error) {
      throw error;
    }

    const profilesByEmployee = new Map((profiles.data ?? []).filter((profile) => profile.employee_id !== null).map((profile) => [profile.employee_id, profile]));
    const roleCodesByUser = new Map<string, string[]>();
    for (const assignment of userRoles.data ?? []) {
      const roleCode = roles.data?.find((role) => role.id === assignment.role_id)?.code;
      if (!roleCode) continue;
      roleCodesByUser.set(assignment.user_id, [...(roleCodesByUser.get(assignment.user_id) ?? []), roleCode]);
    }

    return (employees.data ?? []).map((employee) => {
      const profile = profilesByEmployee.get(employee.id);
      return {
        employeeId: employee.id,
        employeeCode: employee.employee_code,
        fullName: employee.full_name,
        email: employee.email,
        employeeStatus: employee.status,
        userId: profile?.id ?? null,
        username: profile?.username ?? null,
        profileStatus: profile?.status ?? null,
        roleCodes: profile ? roleCodesByUser.get(profile.id) ?? [] : []
      };
    });
  }

  private createClient(): SupabaseClient | null {
    const hasPlaceholder = [environment.supabaseUrl, environment.supabaseAnonKey].some((value) =>
      !value || value.includes('your-') || value.includes('<') || value.includes('>') || value.includes('YOUR_')
    );
    if (hasPlaceholder || !environment.supabaseUrl.startsWith('https://')) {
      return null;
    }

    return createClient(environment.supabaseUrl, environment.supabaseAnonKey);
  }


  async adminResetPassword(
    targetUserId: string,
    newPassword: string
  ): Promise<void> {
    if (!this.client) {
      throw new Error('Supabase chưa được cấu hình.');
    }

    const { data, error } = await this.client.functions.invoke(
      'admin-reset-password',
      {
        body: {
          targetUserId,
          newPassword
        }
      }
    );

    if (error) {
      // Cố gắng đọc thông báo lỗi chi tiết từ Edge Function.
      const context = (error as { context?: unknown }).context;

      if (context instanceof Response) {
        try {
          const details = await context.clone().json();
          throw new Error(
            details?.error || details?.message || error.message
          );
        } catch (detailError) {
          if (detailError instanceof Error &&
              detailError.message !== error.message) {
            throw detailError;
          }
        }
      }

      throw new Error(error.message || 'Không thể đặt lại mật khẩu.');
    }

    if (data?.success !== true) {
      throw new Error(
        data?.error || 'Đặt lại mật khẩu không thành công.'
      );
    }
  }
}
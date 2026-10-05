import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DashboardData, ManagedAccount } from './core/models/dashboard.model';
import { AuthService } from './core/services/auth.service';
import { SupabaseService } from './core/services/supabase.service';

type View = 'overview' | 'employees' | 'documents' | 'notifications' | 'access' | 'audit' | 'accounts';

const emptyData: DashboardData = {
  employees: [], documents: [], notifications: [], profiles: [], roles: [], permissions: [], auditLogs: [],
  userRolesCount: 0, rolePermissionsCount: 0, notificationReadsCount: 0
};

@Component({
  selector: 'app-root',
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  readonly user = signal<{ email?: string } | null>(null);
  readonly hasRole = signal(false);
  readonly isAdmin = signal(false);
  readonly authLoading = signal(true);
  readonly authError = signal<string | null>(null);
  readonly authMessage = signal<string | null>(null);
  readonly showReset = signal(false);
  readonly loginForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });
  readonly resetForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] })
  });
  readonly data = signal<DashboardData>(emptyData);
  readonly activeView = signal<View>('overview');
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly configured = this.supabase.isConfigured;
  readonly activeEmployees = computed(() => this.data().employees.filter((employee) => employee.status === 'ACTIVE').length);
  readonly publishedDocuments = computed(() => this.data().documents.filter((document) => document.status === 'PUBLISHED').length);
  readonly notificationReads = computed(() => this.data().notificationReadsCount);
  readonly managedAccounts = signal<ManagedAccount[]>([]);
  readonly selectedAccount = signal<ManagedAccount | null>(null);
  readonly temporaryPassword = signal('');
  readonly accountLoading = signal(false);
  readonly accountError = signal<string | null>(null);
  readonly accountMessage = signal<string | null>(null);

  readonly navigation = [
    { id: 'overview' as View, label: 'Overview' },
    { id: 'employees' as View, label: 'Employees' },
    { id: 'documents' as View, label: 'Documents' },
    { id: 'notifications' as View, label: 'Notifications' },
    { id: 'access' as View, label: 'Access control' },
    { id: 'audit' as View, label: 'Audit logs' },
    { id: 'accounts' as View, label: 'Account management' }
  ];

  constructor() {
    void this.restoreSession();
  }

  private async restoreSession(): Promise<void> {
    try {
      const recoveryRedirect = new URLSearchParams(window.location.search).get('reset') === '1';
      if (recoveryRedirect) {
        await this.auth.signOut();
        window.history.replaceState({}, '', window.location.pathname);
        this.authMessage.set('Password reset completed. Please sign in again.');
      }
      const state = await this.auth.getState();
      this.user.set(state.user);
      this.hasRole.set(state.hasRole);
      this.isAdmin.set(state.isAdmin);
      if (state.user) {
        await this.refresh();
      }
    } catch (error) {
      this.authError.set(error instanceof Error ? error.message : 'Unable to restore session.');
    } finally {
      this.authLoading.set(false);
    }
  }

  async signIn(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    this.authLoading.set(true);
    this.authError.set(null);
    try {
      const state = await this.auth.signIn(this.loginForm.controls.email.value, this.loginForm.controls.password.value);
      this.user.set(state.user);
      this.hasRole.set(state.hasRole);
      this.isAdmin.set(state.isAdmin);
      await this.refresh();
    } catch (error) {
      this.authError.set(error instanceof Error ? error.message : 'Login failed.');
    } finally {
      this.authLoading.set(false);
    }
  }

  async sendPasswordReset(): Promise<void> {
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }
    this.authLoading.set(true);
    this.authError.set(null);
    try {
      await this.auth.sendPasswordReset(this.resetForm.controls.email.value);
      this.showReset.set(false);
      this.authMessage.set('Password reset email sent. Return to login after changing your password.');
    } catch (error) {
      this.authError.set(error instanceof Error ? error.message : 'Unable to send reset email.');
    } finally {
      this.authLoading.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    this.user.set(null);
    this.hasRole.set(false);
    this.isAdmin.set(false);
    this.data.set(emptyData);
    this.activeView.set('overview');
  }

  selectView(view: View): void {
    this.activeView.set(view);
    if (view === 'accounts' && this.isAdmin()) {
      void this.loadManagedAccounts();
    }
  }

  async loadManagedAccounts(): Promise<void> {
    this.accountLoading.set(true);
    this.accountError.set(null);
    try {
      this.managedAccounts.set(await this.supabase.loadManagedAccounts());
    } catch (error) {
      this.accountError.set(error instanceof Error ? error.message : 'Unable to load accounts.');
    } finally {
      this.accountLoading.set(false);
    }
  }

  selectAccount(account: ManagedAccount): void {
    this.selectedAccount.set(account);
    this.temporaryPassword.set(this.generateTemporaryPassword());
    this.accountError.set(null);
    this.accountMessage.set(null);
  }

  async resetSelectedPassword(): Promise<void> {
    const account = this.selectedAccount();
    if (!this.isAdmin() || !account?.userId) return;
    this.accountLoading.set(true);
    this.accountError.set(null);
    this.accountMessage.set(null);
    try {
      await this.supabase.adminResetPassword(account.userId, this.temporaryPassword());
      this.accountMessage.set(`Temporary password reset for ${account.fullName}. Share it with them through a secure channel.`);
    } catch (error) {
      this.accountError.set(error instanceof Error ? error.message : 'Password reset failed.');
      this.temporaryPassword.set('');
    } finally {
      this.accountLoading.set(false);
    }
  }

  async copyTemporaryPassword(): Promise<void> {
    const password = this.temporaryPassword();
    if (password) await navigator.clipboard.writeText(password);
  }

  private generateTemporaryPassword(): string {
    const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*?'];
    const all = groups.join('');
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const characters = groups.map((group, index) => group[bytes[index] % group.length]);
    for (let index = groups.length; index < bytes.length; index++) characters.push(all[bytes[index] % all.length]);
    for (let index = characters.length - 1; index > 0; index--) {
      const swapIndex = bytes[index] % (index + 1);
      [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
    }
    return characters.join('');
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.data.set(await this.supabase.loadDashboard());
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Unable to load Supabase data.');
    } finally {
      this.loading.set(false);
    }
  }
}

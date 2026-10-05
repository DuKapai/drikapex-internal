import { Injectable } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

export interface AuthState {
  user: User | null;
  hasRole: boolean;
  roleCodes: string[];
  isAdmin: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private readonly supabase: SupabaseService) {}

  async getState(): Promise<AuthState> {
    if (!this.supabase.client) {
      return { user: null, hasRole: false, roleCodes: [], isAdmin: false };
    }
    const { data } = await this.supabase.client.auth.getSession();
    return this.stateFromSession(data.session);
  }

  async signIn(email: string, password: string): Promise<AuthState> {
    if (!this.supabase.client) {
      throw new Error('Supabase is not configured.');
    }
    const { data, error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
    return this.stateFromSession(data.session);
  }

  async sendPasswordReset(email: string): Promise<void> {
    if (!this.supabase.client) {
      throw new Error('Supabase is not configured.');
    }
    const { error } = await this.supabase.client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/?reset=1` });
    if (error) {
      throw error;
    }
  }

  async signOut(): Promise<void> {
    if (!this.supabase.client) {
      return;
    }
    const { error } = await this.supabase.client.auth.signOut();
    if (error) {
      throw error;
    }
  }

  private async stateFromSession(session: Session | null): Promise<AuthState> {
    if (!session?.user || !this.supabase.client) {
      return { user: null, hasRole: false, roleCodes: [], isAdmin: false };
    }
    const { data, error } = await this.supabase.client.from('user_roles').select('role_id, roles(code)').eq('user_id', session.user.id);
    if (error) {
      throw error;
    }
    const roleCodes = (data ?? []).flatMap((entry) => {
      const role = entry.roles;
      if (Array.isArray(role)) return role.map((item) => item.code as string);
      return role && typeof role === 'object' && 'code' in role ? [(role as { code: string }).code] : [];
    });
    return { user: session.user, hasRole: roleCodes.length > 0, roleCodes, isAdmin: roleCodes.includes('ADMIN') };
  }
}

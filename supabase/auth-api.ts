import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/supabase/client";

export function getAuthenticatedUser() {
  return getSupabaseClient().auth.getUser();
}

export function getCurrentSession() {
  return getSupabaseClient().auth.getSession();
}

export function subscribeToAuthChanges(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  const {
    data: { subscription },
  } = getSupabaseClient().auth.onAuthStateChange(callback);
  return () => subscription.unsubscribe();
}

export function signInWithPassword(email: string, password: string) {
  return getSupabaseClient().auth.signInWithPassword({ email, password });
}

export function signOut() {
  return getSupabaseClient().auth.signOut();
}

export function requestPasswordReset(email: string, redirectTo: string) {
  return getSupabaseClient().auth.resetPasswordForEmail(email, { redirectTo });
}

export function updatePassword(password: string) {
  return getSupabaseClient().auth.updateUser({ password });
}

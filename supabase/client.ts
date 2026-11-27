"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readPublicSupabaseConfig } from "@/supabase/config";
import { SupabaseConfigurationError } from "@/supabase/errors";

let browserClient: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (browserClient) {
    return browserClient;
  }

  const result = readPublicSupabaseConfig();
  if (!result.configured) {
    throw new SupabaseConfigurationError();
  }

  browserClient = createClient(result.config.url, result.config.key, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      persistSession: true,
    },
  });
  return browserClient;
}

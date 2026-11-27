export type PublicSupabaseConfig = {
  url: string;
  key: string;
};

export type PublicSupabaseConfigResult =
  | { configured: true; config: PublicSupabaseConfig }
  | { configured: false; reason: "missing" | "invalid" };

type PublicEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_RLS_READY?: string;
  NEXT_PUBLIC_PERMISSION_OVERRIDES_READY?: string;
};

function isPlaceholder(value: string): boolean {
  return /your_project_ref|your_|placeholder|change_me/i.test(value);
}

function isPrivilegedKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) {
    return true;
  }

  const encodedPayload = key.split(".")[1];
  if (!encodedPayload || typeof atob !== "function") {
    return false;
  }

  try {
    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const payload = JSON.parse(atob(padded)) as { role?: unknown };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

const buildEnvironment: PublicEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_RLS_READY: process.env.NEXT_PUBLIC_SUPABASE_RLS_READY,
  NEXT_PUBLIC_PERMISSION_OVERRIDES_READY: process.env.NEXT_PUBLIC_PERMISSION_OVERRIDES_READY,
};

export function arePermissionOverridesReady(
  environment: PublicEnvironment = buildEnvironment,
): boolean {
  return environment.NEXT_PUBLIC_PERMISSION_OVERRIDES_READY?.trim().toLowerCase() === "true";
}

export function isSupabaseRlsReady(
  environment: PublicEnvironment = buildEnvironment,
): boolean {
  return environment.NEXT_PUBLIC_SUPABASE_RLS_READY?.trim().toLowerCase() ===
    "true";
}

export function readPublicSupabaseConfig(
  environment: PublicEnvironment = buildEnvironment,
): PublicSupabaseConfigResult {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    return { configured: false, reason: "missing" };
  }
  if (isPlaceholder(url) || isPlaceholder(key) || isPrivilegedKey(key)) {
    return { configured: false, reason: "invalid" };
  }

  try {
    const parsedUrl = new URL(url);
    const isLocalHttp =
      parsedUrl.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname);

    if (
      (parsedUrl.protocol !== "https:" && !isLocalHttp) ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      return { configured: false, reason: "invalid" };
    }
  } catch {
    return { configured: false, reason: "invalid" };
  }

  return { configured: true, config: { url, key } };
}

import { describe, expect, it } from "vitest";
import {
  arePermissionOverridesReady,
  isSupabaseRlsReady,
  readPublicSupabaseConfig,
} from "../supabase/config";
import {
  getSafeErrorMessage,
  SupabaseConfigurationError,
} from "../supabase/errors";
import {
  canAccessDashboard,
  getRoleLandingPath,
} from "../lib/access";

describe("readPublicSupabaseConfig", () => {
  it("accepts a Supabase HTTPS URL and trims public credentials", () => {
    expect(
      readPublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: " https://workspace.supabase.co ",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: " public-anon-key ",
      }),
    ).toEqual({
      configured: true,
      config: {
        url: "https://workspace.supabase.co",
        key: "public-anon-key",
      },
    });
  });

  it("prefers the publishable key when both public key names are present", () => {
    const result = readPublicSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://workspace.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-anon",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
    });

    expect(result.configured && result.config.key).toBe("publishable");
  });

  it("allows local HTTP development but rejects insecure remote URLs", () => {
    expect(
      readPublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-key",
      }).configured,
    ).toBe(true);

    expect(
      readPublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "http://db.example.com",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key",
      }),
    ).toEqual({ configured: false, reason: "invalid" });
  });

  it("fails closed when configuration is absent or malformed", () => {
    expect(readPublicSupabaseConfig({})).toEqual({
      configured: false,
      reason: "missing",
    });
    expect(
      readPublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "not a URL",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key",
      }),
    ).toEqual({ configured: false, reason: "invalid" });
  });

  it("rejects copied example placeholders and privileged Supabase keys", () => {
    const serviceRolePayload = btoa(
      JSON.stringify({ role: "service_role" }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    expect(
      readPublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY",
      }),
    ).toEqual({ configured: false, reason: "invalid" });
    expect(
      readPublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://workspace.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: `eyJhbGciOiJub25lIn0.${serviceRolePayload}.signature`,
      }),
    ).toEqual({ configured: false, reason: "invalid" });
    expect(
      readPublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://workspace.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_example",
      }),
    ).toEqual({ configured: false, reason: "invalid" });
  });
});

describe("isSupabaseRlsReady", () => {
  it("fails closed unless the reviewed-policy acknowledgment is true", () => {
    expect(isSupabaseRlsReady({})).toBe(false);
    expect(
      isSupabaseRlsReady({ NEXT_PUBLIC_SUPABASE_RLS_READY: "false" }),
    ).toBe(false);
    expect(
      isSupabaseRlsReady({ NEXT_PUBLIC_SUPABASE_RLS_READY: " TRUE " }),
    ).toBe(true);
  });
});

describe("arePermissionOverridesReady", () => {
  it("keeps the unfinished migration disabled unless explicitly enabled", () => {
    expect(arePermissionOverridesReady({})).toBe(false);
    expect(arePermissionOverridesReady({ NEXT_PUBLIC_PERMISSION_OVERRIDES_READY: "false" })).toBe(false);
    expect(arePermissionOverridesReady({ NEXT_PUBLIC_PERMISSION_OVERRIDES_READY: " TRUE " })).toBe(true);
  });
});

describe("role-based landing and dashboard access", () => {
  it("routes admin and manager roles to the dashboard", () => {
    expect(getRoleLandingPath([{ id: 1, code: "ADMIN", name: "Administrator" }])).toBe("/dashboard/");
    expect(getRoleLandingPath([{ id: 2, code: "MANAGER", name: "Manager" }])).toBe("/dashboard/");
    expect(canAccessDashboard([{ id: 2, code: "MANAGER", name: "Manager" }])).toBe(true);
  });

  it("routes member and lower roles to the office and denies dashboard access", () => {
    expect(getRoleLandingPath([{ id: 3, code: "MEMBER", name: "Member" }])).toBe("/office/");
    expect(getRoleLandingPath([{ id: 4, code: "INTERN", name: "Intern" }])).toBe("/office/");
    expect(canAccessDashboard([{ id: 3, code: "MEMBER", name: "Member" }])).toBe(false);
    expect(getRoleLandingPath([])).toBeNull();
  });

  it("uses the highest assigned role when an account has more than one", () => {
    expect(
      getRoleLandingPath([
        { id: 3, code: "MEMBER", name: "Member" },
        { id: 2, code: "MANAGER", name: "Manager" },
      ]),
    ).toBe("/dashboard/");
  });

  it("denies managers dashboard access after the permission migration is ready", () => {
    const manager = { id: 2, code: "MANAGER", name: "Manager" };
    const admin = { id: 1, code: "ADMIN", name: "Administrator" };
    expect(getRoleLandingPath([manager], true)).toBe("/office/");
    expect(canAccessDashboard([manager], true)).toBe(false);
    expect(canAccessDashboard([manager, admin], true)).toBe(true);
    expect(canAccessDashboard([manager], false)).toBe(true);
  });
});

describe("getSafeErrorMessage", () => {
  it("maps permissions and missing schema to actionable messages without leaking details", () => {
    const permissionMessage = getSafeErrorMessage({
      code: "42501",
      message: "private database internals",
    });
    const schemaMessage = getSafeErrorMessage({
      code: "PGRST205",
      message: "private table diagnostics",
    });

    expect(permissionMessage).toContain("does not have permission");
    expect(schemaMessage).toContain("database schema");
    expect(permissionMessage).not.toContain("private");
    expect(schemaMessage).not.toContain("diagnostics");
  });

  it("returns a safe configuration message and generic fallback", () => {
    expect(getSafeErrorMessage(new SupabaseConfigurationError())).toContain(
      "not configured",
    );
    expect(
      getSafeErrorMessage({ message: "do not show this raw backend response" }),
    ).not.toContain("raw backend response");
  });
});

"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import DashboardAdmin from "@/components/dashboard-admin";
import {
  canAccessDashboard,
  getRoleLandingPath,
} from "@/lib/access";
import {
  loadWorkspaceIdentity,
  type WorkspaceProfile,
  type WorkspaceRole,
} from "@/supabase/workspace-api";
import {
  arePermissionOverridesReady,
  isSupabaseRlsReady,
  readPublicSupabaseConfig,
} from "@/supabase/config";
import { getSafeErrorMessage } from "@/supabase/errors";
import {
  getCurrentSession,
  signOut as signOutFromSupabase,
  subscribeToAuthChanges,
} from "@/supabase/auth-api";

type DashboardSection = "accounts" | "permissions" | "audit";

const navigation: {
  id: DashboardSection;
  title: string;
  icon: string;
  permission: string;
  legacyPermission: string;
}[] = [
  { id: "accounts", title: "Accounts", icon: "◎", permission: "menu.accounts.view", legacyPermission: "users.view" },
  { id: "permissions", title: "Roles & permissions", icon: "⌘", permission: "menu.permissions.view", legacyPermission: "roles.view" },
  { id: "audit", title: "Audit log", icon: "≡", permission: "menu.audit.view", legacyPermission: "audit.view" },
];

function displayName(user: User, profile: WorkspaceProfile | null): string {
  return (
    profile?.display_name?.trim() ||
    (typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : null) ||
    user.email?.split("@")[0] ||
    "Workspace member"
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [roles, setRoles] = useState<WorkspaceRole[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [section, setSection] = useState<DashboardSection>("accounts");
  const [sessionChecked, setSessionChecked] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const config = useMemo(() => readPublicSupabaseConfig(), []);
  const rlsReady = useMemo(() => isSupabaseRlsReady(), []);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;
    let verificationTimeout: number | null = null;
    async function initialize() {
      if (!config.configured) {
        router.replace("/login/");
        return;
      }
      try {
        unsubscribe = subscribeToAuthChanges((_event, session) => {
          if (!session && active) router.replace("/login/");
        });
        const { data: sessionData, error: sessionError } = await getCurrentSession();
        if (!active) return;
        if (sessionError) {
          setError(getSafeErrorMessage(sessionError));
          setSessionChecked(true);
          return;
        }
        const currentUser = sessionData.session?.user;
        if (!currentUser) {
          router.replace("/login/");
          return;
        }
        setSessionChecked(true);
        if (!rlsReady) {
          setError("Apply and verify the RLS policies before enabling dashboard access.");
          return;
        }
        verificationTimeout = window.setTimeout(() => {
          if (active) {
            setError("Access verification timed out. Check your connection and try again.");
          }
        }, 15000);
        const identity = await loadWorkspaceIdentity(currentUser.id);
        if (verificationTimeout !== null) {
          window.clearTimeout(verificationTimeout);
          verificationTimeout = null;
        }
        if (!active) return;
        if (identity.error) {
          setError(identity.error);
          return;
        }
        const access = identity.data;
        if (!access?.profile || access.profile.status !== "ACTIVE") {
          await signOutFromSupabase();
          setError("This account has no active Drikapex profile.");
          return;
        }
        const landing = getRoleLandingPath(access.roles);
        if (!landing) {
          setError("No access role is assigned to this account. Contact an administrator.");
          return;
        }
        if (!canAccessDashboard(access.roles)) {
          router.replace(landing);
          return;
        }
        setError(null);
        setUser(currentUser);
        setProfile(access.profile);
        setRoles(access.roles);
        setPermissions(access.permissions);
        setIsOwner(access.isOwner);
        setReady(true);
      } catch (cause) {
        if (active) {
          setSessionChecked(true);
          setError(getSafeErrorMessage(cause));
        }
      }
    }
    void initialize();
    return () => {
      active = false;
      if (verificationTimeout !== null) {
        window.clearTimeout(verificationTimeout);
      }
      unsubscribe?.();
    };
  }, [config, rlsReady, router]);

  async function signOut() {
    setError(null);
    try {
      const { error: signOutError } = await signOutFromSupabase();
      if (signOutError) {
        setError(getSafeErrorMessage(signOutError));
        return;
      }
      router.replace("/login/");
    } catch (cause) {
      setError(getSafeErrorMessage(cause));
    }
  }

  const actorLevel = roles.length
    ? Math.min(...roles.map((role) => role.id))
    : Number.POSITIVE_INFINITY;
  const accountName = user ? displayName(user, profile) : "Workspace";
  const visibleNavigation = navigation.filter((item) =>
    permissions.includes(arePermissionOverridesReady() ? item.permission : item.legacyPermission),
  );

  if (!ready || !user) {
    return (
      <main className="access-gate">
        <div className="access-gate__card">
          <Image
            alt=""
            className="brand__symbol"
            height={40}
            priority
            src="/office.png"
            width={40}
          />
          <span className="eyebrow">DRIKAPEX INTERNAL</span>
          <h1>
            {error
              ? "Access unavailable"
              : sessionChecked
                ? "Verifying access…"
                : "Checking saved sign-in…"}
          </h1>
          <p>
            {error ??
              (sessionChecked
                ? "Checking your active profile and account role."
                : "Restoring your saved Drikapex session.")}
          </p>
          {(error || !sessionChecked) && (
            <Link className="button button--primary" href="/login/">
              {error ? "Return to sign in" : "Sign in"}
            </Link>
          )}
        </div>
      </main>
    );
  }

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard/" aria-label="Drikapex dashboard">
          <Image
            alt=""
            className="brand__symbol"
            height={40}
            priority
            src="/office.png"
            width={40}
          />
          <span className="brand__wordmark">DRIKAPEX<small>ADMINISTRATION</small></span>
        </Link>
        <div className="sidebar__section-label">CONTROL CENTER</div>
        <nav className="sidebar__nav" aria-label="Dashboard navigation">
          {visibleNavigation.map((item) => (
            <button
              aria-current={section === item.id ? "page" : undefined}
              className={`nav-item${section === item.id ? " nav-item--active" : ""}`}
              key={item.id}
              onClick={() => setSection(item.id)}
              type="button"
            >
              <span className="nav-item__icon" aria-hidden="true">{item.icon}</span>
              {item.title}
            </button>
          ))}
        </nav>
        <div className="sidebar__bottom">
          <Link className="nav-item dashboard-office-link" href="/office/">
            <span className="nav-item__icon" aria-hidden="true">◇</span>
            Open virtual office
          </Link>
          <div className="profile-chip">
            <span className="profile-chip__avatar" aria-hidden="true">{accountName.slice(0, 1).toUpperCase()}</span>
            <span className="profile-chip__name">
              {accountName}
              <small>{roles.map((role) => role.code).join(" · ")}</small>
            </span>
            <button aria-label="Sign out" className="profile-chip__action" onClick={() => void signOut()} title="Sign out" type="button">↗</button>
          </div>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div>
            <span className="topbar__kicker">CONTROL CENTER</span>
            <span className="topbar__divider" aria-hidden="true">/</span>
            <span className="topbar__current">{navigation.find((item) => item.id === section)?.title}</span>
          </div>
          <div className="topbar__right">
            <span className="connection-pill connection-pill--ready"><span className="status-dot" aria-hidden="true" />Role verified</span>
            <span className="topbar__avatar" aria-hidden="true">{accountName.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        <div className="page-content">
          {error && <p className="inline-message" role="alert">{error}</p>}
          <section className="dashboard-intro">
            <span className="eyebrow">{isOwner ? "OWNER · FULL ACCESS" : `ADMINISTRATOR · LEVEL ${actorLevel}`}</span>
            <h1>{section === "accounts" ? "Accounts & access" : section === "permissions" ? "Roles & permissions" : "Audit trail"}</h1>
            <p>
              This control center is separate from the virtual office. Access
              depends on your role and permissions.
            </p>
          </section>
          {visibleNavigation.some((item) => item.id === section) ? (
            <DashboardAdmin
              actorId={user.id}
              actorLevel={actorLevel}
              isOwner={isOwner}
              permissions={permissions}
              section={section}
            />
          ) : (
            <p className="notice-card" role="status">
              Your role does not have permission for this dashboard section.
            </p>
          )}
          <footer className="page-footer">
            <span>DRIKAPEX INTERNAL</span>
            <span>ACCESS ENFORCED BY SUPABASE RLS</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

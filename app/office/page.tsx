"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessDashboard } from "@/lib/access";
import WorkspaceModule, {
  type WorkspaceModuleId,
} from "@/components/workspace-module";
import MonthlyTasks from "@/components/monthly-tasks";
import PersonalProfilePage from "@/components/personal-profile";
import { useWorkspacePresence } from "@/components/workspace-presence";
import {
  loadOfficeMembers,
  loadWorkspaceIdentity,
  type OfficeMember,
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
  getAuthenticatedUser,
  signOut as signOutFromSupabase,
  subscribeToAuthChanges,
} from "@/supabase/auth-api";

const VirtualOffice = dynamic(
  () => import("@/components/virtual-office"),
  {
    ssr: false,
    loading: () => (
      <div className="office-loading" role="status">Preparing the office floor…</div>
    ),
  },
);

type OfficeView = "floor" | "monthly-tasks" | "profile" | WorkspaceModuleId;

const officeModules: {
  id: WorkspaceModuleId;
  label: string;
  icon: string;
  permission: string;
  capability: string;
}[] = [
  { id: "documents", label: "Documents", icon: "▤", permission: "menu.documents.view", capability: "documents.view" },
  { id: "notifications", label: "Updates", icon: "◌", permission: "menu.notifications.view", capability: "notifications.view" },
];

export default function OfficePage() {
  const router = useRouter();
  const presence = useWorkspacePresence();
  const config = useMemo(() => readPublicSupabaseConfig(), []);
  const rlsReady = useMemo(() => isSupabaseRlsReady(), []);
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [roles, setRoles] = useState<WorkspaceRole[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [members, setMembers] = useState<OfficeMember[]>([]);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [view, setView] = useState<OfficeView>("floor");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [monthlyOpened, setMonthlyOpened] = useState(false);
  const [monthlyDirty, setMonthlyDirty] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;
    async function initialize() {
      if (!config.configured) {
        setError(
          config.reason === "invalid"
            ? "Supabase public configuration is invalid."
            : "Configure the Supabase public URL and publishable/anon key before entering the office.",
        );
        return;
      }
      if (!rlsReady) {
        setError("Apply and verify the database RLS policies before loading employee data.");
        return;
      }
      try {
        unsubscribe = subscribeToAuthChanges((_event, session) => {
          if (!session && active) router.replace("/login/");
        });
        const { data: authData, error: authError } = await getAuthenticatedUser();
        if (!active) return;
        if (authError) {
          setError(getSafeErrorMessage(authError));
          return;
        }
        if (!authData.user) {
          router.replace("/login/");
          return;
        }
        const identity = await loadWorkspaceIdentity(authData.user.id);
        if (!active) return;
        if (identity.error) {
          setError(identity.error);
          return;
        }
        const access = identity.data;
        if (!access?.profile || access.profile.status !== "ACTIVE") {
          await signOutFromSupabase();
          router.replace("/login/");
          return;
        }
        if (access.roles.length === 0) {
          setError("This account has no assigned access level. Contact an administrator.");
          return;
        }
        setUserId(authData.user.id);
        setProfile(access.profile);
        setRoles(access.roles);
        setPermissions(access.permissions);
        setIsOwner(access.isOwner);
        const canSeeOffice = access.permissions.includes("menu.office.floor.view") &&
          access.permissions.includes("office.view");
        setView(canSeeOffice ? "floor" : "profile");
        if (canSeeOffice && access.permissions.includes("personnel.view")) {
          const result = await loadOfficeMembers();
          if (!active) return;
          setMembers(result.data ?? []);
          setMemberError(result.error);
        }
        setReady(true);
      } catch (cause) {
        if (active) setError(getSafeErrorMessage(cause));
      }
    }
    void initialize();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [config, rlsReady, router]);

  const signOut = useCallback(async () => {
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
  }, [router]);

  if (!ready) {
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
          <span className="eyebrow">DRIKAPEX · VIRTUAL OFFICE</span>
          <h1>{error ? "Office unavailable" : "Opening your workspace…"}</h1>
          <p>{error ?? "Verifying your active employee profile and office access."}</p>
          {error && <Link className="button button--primary" href="/login/">Return to sign in</Link>}
        </div>
      </main>
    );
  }

  const name = profile?.display_name || profile?.username || "Workspace member";
  const permissionControlReady = arePermissionOverridesReady();
  const visibleModules = officeModules.filter((item) =>
    permissions.includes(item.capability) &&
    (!permissionControlReady || permissions.includes(item.permission)),
  );
  const canSeeOffice = !permissionControlReady ||
    (permissions.includes("office.view") &&
      permissions.includes("menu.office.floor.view"));
  const canSeeMonthlyReport = !permissionControlReady ||
    (permissions.includes("monthly_tasks.view") &&
      permissions.includes("menu.monthly_report.view"));
  const selectedModule =
    view === "floor" ? null : visibleModules.find((item) => item.id === view);

  return (
    <div className={`workspace office-workspace${sidebarCollapsed ? " office-workspace--sidebar-collapsed" : ""}`}>
      <aside className="sidebar" id="office-navigation" hidden={sidebarCollapsed}>
        <Link className="brand" href="/office/" aria-label="Drikapex virtual office">
          <Image
            alt=""
            className="brand__symbol"
            height={40}
            priority
            src="/office.png"
            width={40}
          />
          <span className="brand__wordmark">DRIKAPEX<small>VIRTUAL OFFICE</small></span>
        </Link>
        <div className="sidebar__section-label">YOUR WORKPLACE</div>
        <nav className="sidebar__nav" aria-label="Office navigation">
          {canSeeOffice && <button
            aria-current={view === "floor" ? "page" : undefined}
            className={`nav-item${view === "floor" ? " nav-item--active" : ""}`}
            onClick={() => setView("floor")}
            type="button"
          >
            <span className="nav-item__icon" aria-hidden="true">◇</span>
            Office floor
          </button>}
          {canSeeMonthlyReport && <button
            aria-current={view === "monthly-tasks" ? "page" : undefined}
            className={`nav-item${view === "monthly-tasks" ? " nav-item--active" : ""}`}
            onClick={() => { setMonthlyOpened(true); setView("monthly-tasks"); setSidebarCollapsed(true); }}
            type="button"
          >
            <span className="nav-item__icon" aria-hidden="true">▦</span>
            Công việc tháng
          </button>}
          {(!permissionControlReady || permissions.includes("menu.profile.view")) && (
            <button
              aria-current={view === "profile" ? "page" : undefined}
              className={`nav-item${view === "profile" ? " nav-item--active" : ""}`}
              onClick={() => setView("profile")}
              type="button"
            >
              <span className="nav-item__icon" aria-hidden="true">◉</span>
              Hồ sơ cá nhân
            </button>
          )}
          {visibleModules.map((item) => (
            <button
              aria-current={view === item.id ? "page" : undefined}
              className={`nav-item${view === item.id ? " nav-item--active" : ""}`}
              key={item.id}
              onClick={() => setView(item.id)}
              type="button"
            >
              <span className="nav-item__icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar__bottom">
          {canAccessDashboard(roles, permissionControlReady) && (
            <Link className="nav-item dashboard-office-link" href="/dashboard/" onClick={(event) => {
              if (monthlyDirty && !window.confirm("Có nội dung công việc chưa lưu. Rời trang?")) event.preventDefault();
            }}>
              <span className="nav-item__icon" aria-hidden="true">⌘</span>
              Administration dashboard
            </Link>
          )}
          <div className="profile-chip">
            <span className="profile-chip__avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
            <span className="profile-chip__name">{name}<small>{roles.map((role) => role.code).join(" · ")}</small></span>
            <button aria-label="Sign out" className="profile-chip__action" onClick={() => {
              if (!monthlyDirty || window.confirm("Có nội dung công việc chưa lưu. Đăng xuất?")) void signOut();
            }} title="Sign out" type="button">↗</button>
          </div>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div>
            <button type="button" className="office-sidebar-toggle" aria-controls="office-navigation" aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? "Mở menu" : "Ẩn menu"} onClick={() => setSidebarCollapsed((value) => !value)}>
              ☰
            </button>
            <span className="topbar__kicker">DRIKAPEX HEADQUARTERS</span>
            <span className="topbar__divider" aria-hidden="true">/</span>
            <span className="topbar__current">
              {view === "monthly-tasks"
                ? "Công việc tháng"
                : view === "profile"
                  ? "Hồ sơ cá nhân"
                  : selectedModule?.label ?? "Virtual office"}
            </span>
          </div>
          <div className="topbar__right">
            {permissions.includes("workspace.presence") && <div className="workspace-online" aria-label="Nhân sự đang trực tuyến">
              {presence.onlineMembers.slice(0, 3).map((person) => (
                <span className="workspace-online__avatar" key={person.user_id}
                  title={person.display_name || person.username || "Nhân sự trực tuyến"}
                  style={person.avatar_url ? { backgroundImage: `url("${person.avatar_url}")` } : undefined}>
                  {!person.avatar_url && (person.display_name || person.username || "?").slice(0, 1).toUpperCase()}
                </span>
              ))}
              {presence.onlineMembers.length > 3 && <span className="workspace-online__more">+{presence.onlineMembers.length - 3}</span>}
              <span className={`workspace-online__status${presence.available && presence.onlineMembers.some((person) => person.user_id === userId) ? " workspace-online__status--ready" : ""}`}>
                <span aria-hidden="true" />
                {presence.error ? "Không thể kết nối" : presence.available && presence.onlineMembers.some((person) => person.user_id === userId) ? "Đã kết nối" : "Đang kết nối"}
              </span>
            </div>}
            <span className="topbar__avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        <div className="page-content office-page-content">
          {error && <p className="inline-message" role="alert">{error}</p>}
          {view === "floor" && (
            <section className="page-section">
              <div className="page-title-block office-page-title">
                <span className="eyebrow">YOUR DIGITAL WORKPLACE · FLOOR 01</span>
                <h1>Welcome, {name}</h1>
                <p>
                  Your account opens directly into the office. Explore the floor
                  plan, meet the team and enter the workspaces your role allows.
                </p>
              </div>
              <VirtualOffice
                currentUserId={userId}
                memberError={memberError}
                members={members}
                onSelect={(destination) => {
                  if (destination === "documents" || destination === "notifications") {
                    if (visibleModules.some((item) => item.id === destination)) setView(destination);
                    return;
                  }
                  setView("floor");
                }}
              />
            </section>
          )}
          {monthlyOpened && (
            <div hidden={view !== "monthly-tasks"}>
              <MonthlyTasks userId={userId} manager={roles.some((role) => role.id <= 2)} owner={isOwner} onDirtyChange={setMonthlyDirty} />
            </div>
          )}
          {view === "profile" &&
            (!permissionControlReady || permissions.includes("menu.profile.view")) && (
            <PersonalProfilePage userId={userId} />
          )}
          {selectedModule && (
            <>
              <button className="text-button office-back-button" onClick={() => setView("floor")} type="button">
                ← Back to the office floor
              </button>
              <WorkspaceModule
                permissions={permissions}
                userId={userId}
                view={selectedModule.id}
              />
            </>
          )}
          <footer className="page-footer">
            <span>DRIKAPEX INTERNAL · VIRTUAL OFFICE</span>
            <span>YOUR ROLE CONTROLS WHAT YOU CAN ACCESS</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

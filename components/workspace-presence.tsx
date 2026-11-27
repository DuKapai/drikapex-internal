"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { subscribeToAuthChanges } from "@/supabase/auth-api";
import {
  arePermissionOverridesReady,
  isSupabaseRlsReady,
  readPublicSupabaseConfig,
} from "@/supabase/config";
import { getEffectivePermissions } from "@/supabase/permissions-api";
import { leaveWorkspacePresence, touchWorkspacePresence, type OnlineWorkspaceMember } from "@/supabase/workspace-presence-api";

type Presence = { onlineMembers: OnlineWorkspaceMember[]; available: boolean; error: string | null };
const PresenceContext = createContext<Presence>({ onlineMembers: [], available: false, error: null });

export function useWorkspacePresence() {
  return useContext(PresenceContext);
}

export function WorkspacePresenceProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [presence, setPresence] = useState<Presence>({ onlineMembers: [], available: false, error: null });

  useEffect(() => {
    if (!readPublicSupabaseConfig().configured || !isSupabaseRlsReady()) return;
    return subscribeToAuthChanges((_event, session) => {
      setUserId(session?.user.id ?? null);
      if (!session) setPresence({ onlineMembers: [], available: false, error: null });
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let pending = false;
    let clientId: string | null = null;
    let timer: number | null = null;
    async function sync() {
      if (!clientId || pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const onlineMembers = await touchWorkspacePresence(clientId);
        if (active) setPresence({ onlineMembers, available: true, error: null });
      } catch {
        if (active) setPresence({ onlineMembers: [], available: false, error: "Không thể cập nhật trạng thái trực tuyến." });
      } finally {
        pending = false;
      }
    }
    const resume = () => { if (document.visibilityState === "visible") void sync(); };
    async function start() {
      if (arePermissionOverridesReady()) {
        const { data, error } = await getEffectivePermissions();
        if (!active) return;
        if (error) {
          setPresence({ onlineMembers: [], available: false, error: "Không thể xác minh quyền hiện diện." });
          return;
        }
        if (!data?.some((permission) =>
          permission.code === "workspace.presence" && permission.allowed,
        )) {
          setPresence({ onlineMembers: [], available: false, error: null });
          return;
        }
      }
      if (!active) return;
      clientId = crypto.randomUUID();
      void sync();
      timer = window.setInterval(() => void sync(), 20000);
      document.addEventListener("visibilitychange", resume);
      window.addEventListener("online", resume);
    }
    void start().catch(() => {
      if (active) {
        setPresence({ onlineMembers: [], available: false, error: "Không thể xác minh quyền hiện diện." });
      }
    });
    return () => {
      active = false;
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      if (clientId) {
        void leaveWorkspacePresence(clientId).catch(() => {
          console.warn("Không thể kết thúc trạng thái trực tuyến; trạng thái sẽ tự hết hạn.");
        });
      }
    };
  }, [userId]);

  return <PresenceContext.Provider value={presence}>{children}</PresenceContext.Provider>;
}

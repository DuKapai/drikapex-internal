import { getSupabaseClient } from "@/supabase/client";
import { getSafeErrorMessage } from "@/supabase/errors";

export type OnlineWorkspaceMember = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export async function touchWorkspacePresence(clientId: string): Promise<OnlineWorkspaceMember[]> {
  const { data, error } = await getSupabaseClient().rpc("touch_workspace_presence", {
    p_client_id: clientId,
  });
  if (error) throw new Error(getSafeErrorMessage(error));
  if (!Array.isArray(data) || !data.every((row) =>
    typeof row === "object" && row !== null && typeof row.user_id === "string" &&
    (row.display_name === null || typeof row.display_name === "string") &&
    (row.username === null || typeof row.username === "string") &&
    (row.avatar_url === null || typeof row.avatar_url === "string"))) {
    throw new Error("Dữ liệu trạng thái trực tuyến không hợp lệ.");
  }
  return data as OnlineWorkspaceMember[];
}

export async function leaveWorkspacePresence(clientId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc("leave_workspace_presence", {
    p_client_id: clientId,
  });
  if (error) throw new Error(getSafeErrorMessage(error));
}

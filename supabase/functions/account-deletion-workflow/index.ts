import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXECUTING" | "COMPLETED";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const allowedOrigins = new Set(
  (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const jsonHeaders: Record<string, string> = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  Vary: "Origin",
};

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  return origin && allowedOrigins.has(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      }
    : {};
}

function respond(
  request: Request,
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...corsHeaders(request) },
  });
}

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured for account-deletion-workflow.",
  );
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function normalizeRoles(
  assignments: { role_id: number; roles: { id: number; code: string } | { id: number; code: string }[] | null }[],
): { id: number; code: string }[] {
  return assignments.flatMap((assignment) => {
    if (Array.isArray(assignment.roles)) return assignment.roles;
    return assignment.roles ? [assignment.roles] : [];
  });
}

async function getAccountLevel(userId: string): Promise<number | null> {
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error("Could not verify an account profile.");
  if (profile?.status !== "ACTIVE") return null;

  const { data: assignments, error: rolesError } = await adminClient
    .from("user_roles")
    .select("role_id,roles(id,code)")
    .eq("user_id", userId);
  if (rolesError) throw new Error("Could not verify account permissions.");
  const roles = normalizeRoles(assignments ?? []);
  return roles.length ? Math.min(...roles.map((role) => Number(role.id))) : null;
}

async function getOwnerStatus(userId: string): Promise<boolean> {
  const { data, error } = await adminClient.rpc("drikapex_is_owner_user", {
    p_user: userId,
  });
  if (error) throw new Error("Could not verify the designated Owner.");
  return data === true;
}

async function hasPermission(userId: string, permissionCode: string): Promise<boolean> {
  const { data, error } = await adminClient.rpc("drikapex_user_has_permission", {
    p_user_id: userId,
    required_code: permissionCode,
  });
  if (error) throw new Error("Could not verify account permissions.");
  return data === true;
}

async function getTarget(
  targetUserId: string,
): Promise<{ displayName: string; isDesignatedOwner: boolean } | null> {
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id,display_name,username")
    .eq("id", targetUserId)
    .maybeSingle();
  if (profileError) throw new Error("Could not verify the target account.");
  if (!profile) return null;

  const { data: owner, error: ownerError } = await adminClient
    .from("monthly_task_lock_owner")
    .select("user_id")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (ownerError) throw new Error("Could not verify the target Owner identity.");
  return {
    displayName: profile.display_name ?? profile.username ?? targetUserId,
    isDesignatedOwner: owner !== null,
  };
}

async function loadRequest(requestId: string) {
  const { data, error } = await adminClient
    .from("account_deletion_requests")
    .select("id,requested_by,target_user_id,status")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error("Could not load the account deletion request.");
  return data as {
    id: number;
    requested_by: string;
    target_user_id: string;
    status: RequestStatus;
  } | null;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("Origin");
    if (origin && !allowedOrigins.has(origin)) {
      return respond(request, 403, { error: "Origin is not allowed." });
    }
    return new Response(null, {
      status: 204,
      headers: { ...jsonHeaders, ...corsHeaders(request) },
    });
  }
  if (request.method !== "POST") {
    return respond(request, 405, { error: "Method not allowed." });
  }
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) {
    return respond(request, 403, { error: "Origin is not allowed." });
  }

  const token = request.headers
    .get("Authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return respond(request, 401, { error: "Authentication is required." });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return respond(request, 400, { error: "Request body must be valid JSON." });
  }
  if (typeof payload !== "object" || payload === null || !("action" in payload)) {
    return respond(request, 400, { error: "A valid action is required." });
  }
  const { action } = payload as { action?: unknown };
  if (!["request", "approve", "reject", "execute"].includes(String(action))) {
    return respond(request, 400, { error: "Unsupported workflow action." });
  }

  try {
    const {
      data: { user: actor },
      error: authError,
    } = await adminClient.auth.getUser(token);
    if (authError || !actor) {
      return respond(request, 401, { error: "The session is invalid or expired." });
    }
    const actorLevel = await getAccountLevel(actor.id);
    if (actorLevel === null) {
      return respond(request, 403, { error: "An active role-assigned profile is required." });
    }
    const actorIsOwner = await getOwnerStatus(actor.id);

    if (action === "request") {
      const { targetUserId } = payload as { targetUserId?: unknown };
      if (!isUuid(targetUserId)) {
        return respond(request, 400, { error: "A valid targetUserId is required." });
      }
      if (actorIsOwner || actorLevel !== 1 || !(await hasPermission(actor.id, "personnel.delete"))) {
        return respond(request, 403, { error: "An administrator with deletion permission is required to request Owner approval." });
      }
      if (targetUserId === actor.id) {
        return respond(request, 403, { error: "You cannot request deletion of your own account." });
      }
      const target = await getTarget(targetUserId);
      if (!target) return respond(request, 404, { error: "The target account was not found." });
      if (target.isDesignatedOwner) {
        return respond(request, 403, { error: "The designated Owner account cannot be deleted here." });
      }
      const { data: created, error: insertError } = await adminClient
        .from("account_deletion_requests")
        .insert({
          requested_by: actor.id,
          target_user_id: targetUserId,
          status: "PENDING",
        })
        .select("id,status,created_at")
        .single();
      if (insertError) {
        if (insertError.code === "23505") {
          return respond(request, 409, { error: "An active deletion request already exists for this account." });
        }
        return respond(request, 500, { error: "Could not submit the deletion request." });
      }
      return respond(request, 200, { request: created, targetName: target.displayName });
    }

    const { requestId } = payload as { requestId?: unknown };
    if (
      (typeof requestId !== "number" && typeof requestId !== "string") ||
      !/^\d+$/.test(String(requestId))
    ) {
      return respond(request, 400, { error: "A valid requestId is required." });
    }
    const deletionRequest = await loadRequest(String(requestId));
    if (!deletionRequest) {
      return respond(request, 404, { error: "The deletion request was not found." });
    }

    if (action === "approve" || action === "reject") {
      if (!actorIsOwner || !(await hasPermission(actor.id, "personnel.delete"))) {
        return respond(request, 403, { error: "Only the designated Owner may review deletion requests." });
      }
      if (deletionRequest.status !== "PENDING") {
        return respond(request, 409, { error: "This request has already been reviewed." });
      }
      const status = action === "approve" ? "APPROVED" : "REJECTED";
      const { data: updated, error: updateError } = await adminClient
        .from("account_deletion_requests")
        .update({
          status,
          reviewed_by: actor.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", deletionRequest.id)
        .eq("status", "PENDING")
        .select("id,status")
        .maybeSingle();
      if (updateError) {
        return respond(request, 500, { error: "Could not update the deletion request." });
      }
      if (!updated) {
        return respond(request, 409, { error: "This request has already been reviewed." });
      }
      return respond(request, 200, { request: updated });
    }

    if (action === "execute") {
      if (
        actorIsOwner ||
        actorLevel !== 1 ||
        deletionRequest.requested_by !== actor.id ||
        !(await hasPermission(actor.id, "personnel.delete"))
      ) {
        return respond(request, 403, { error: "Only the requesting administrator with deletion permission may execute this approved request." });
      }
      if (deletionRequest.status !== "APPROVED") {
        return respond(request, 409, { error: "The request must be approved before deletion." });
      }
      const target = await getTarget(deletionRequest.target_user_id);
      if (!target) return respond(request, 404, { error: "The target account no longer exists." });
      if (target.isDesignatedOwner) {
        return respond(request, 403, { error: "The designated Owner account cannot be deleted here." });
      }
      const { data: claimed, error: claimError } = await adminClient
        .from("account_deletion_requests")
        .update({ status: "EXECUTING", updated_at: new Date().toISOString() })
        .eq("id", deletionRequest.id)
        .eq("requested_by", actor.id)
        .eq("status", "APPROVED")
        .select("id")
        .maybeSingle();
      if (claimError) {
        return respond(request, 500, { error: "Could not claim the approved deletion request." });
      }
      if (!claimed) {
        return respond(request, 409, { error: "This request is already being processed or is no longer approved." });
      }

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(
        deletionRequest.target_user_id,
      );
      if (deleteError) {
        const { error: releaseError } = await adminClient
          .from("account_deletion_requests")
          .update({ status: "APPROVED", updated_at: new Date().toISOString() })
          .eq("id", deletionRequest.id)
          .eq("status", "EXECUTING");
        if (releaseError) {
          return respond(request, 500, {
            error: "Account deletion failed and the request could not be returned to approved status. Contact an administrator.",
          });
        }
        return respond(request, 400, { error: "Supabase could not delete the approved account." });
      }
      const { error: auditError } = await adminClient.from("audit_logs").insert({
        user_id: actor.id,
        action: "DELETE_ACCOUNT_APPROVED",
        module: "ADMINISTRATION",
        target_type: "AUTH_USER",
        target_id: deletionRequest.target_user_id,
        description: `Account ${target.displayName} deleted by requesting administrator after Owner approval.`,
      });
      const { error: completeError } = await adminClient
        .from("account_deletion_requests")
        .update({ status: "COMPLETED", updated_at: new Date().toISOString() })
        .eq("id", deletionRequest.id)
        .eq("status", "EXECUTING");
      if (completeError) {
        return respond(request, 200, {
          deleted: true,
          requestCompleted: false,
          auditLogged: !auditError,
          warning: "The account was deleted, but the workflow status could not be finalized.",
        });
      }
      return respond(request, 200, {
        deleted: true,
        requestCompleted: true,
        auditLogged: !auditError,
        warning: auditError
          ? "The account was deleted, but the audit event could not be saved."
          : undefined,
      });
    }

    return respond(request, 400, { error: "Unsupported workflow action." });
  } catch {
    return respond(request, 500, { error: "The account deletion workflow could not be completed." });
  }
});

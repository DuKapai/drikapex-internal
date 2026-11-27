import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function respond(
  request: Request,
  status: number,
  body: Record<string, unknown>,
): Response {
  const origin = request.headers.get("Origin");
  const cors: Record<string, string> =
    origin && allowedOrigins.has(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        }
      : {};
  const headers = { ...jsonHeaders, ...cors };
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured for delete-account.",
  );
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("Origin");
    if (origin && !allowedOrigins.has(origin)) {
      return respond(request, 403, { error: "Origin is not allowed." });
    }
    return new Response(null, {
      status: 204,
      headers: {
        ...jsonHeaders,
        ...(origin && allowedOrigins.has(origin)
          ? {
              "Access-Control-Allow-Origin": origin,
              "Access-Control-Allow-Headers":
                "authorization, x-client-info, apikey, content-type",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
            }
          : {}),
      },
    });
  }
  if (request.method !== "POST") {
    return respond(request, 405, { error: "Method not allowed." });
  }

  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) {
    return respond(request, 403, { error: "Origin is not allowed." });
  }

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return respond(request, 401, { error: "Authentication is required." });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return respond(request, 400, { error: "Request body must be valid JSON." });
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("userId" in payload) ||
    typeof payload.userId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      payload.userId,
    )
  ) {
    return respond(request, 400, { error: "A valid userId is required." });
  }
  const targetUserId = payload.userId;

  try {
    const {
      data: { user: actor },
      error: authError,
    } = await adminClient.auth.getUser(token);
    if (authError || !actor) {
      return respond(request, 401, { error: "The session is invalid or expired." });
    }
    if (actor.id === targetUserId) {
      return respond(request, 403, { error: "You cannot delete your own account." });
    }

    const [
      { data: actorProfile, error: actorProfileError },
      { data: isOwner, error: ownerError },
      { data: canDelete, error: permissionError },
      { data: targetIsOwner, error: targetOwnerError },
    ] = await Promise.all([
      adminClient.from("profiles").select("status").eq("id", actor.id).maybeSingle(),
      adminClient.rpc("drikapex_is_owner_user", { p_user: actor.id }),
      adminClient.rpc("drikapex_user_has_permission", {
        p_user_id: actor.id,
        required_code: "personnel.delete",
      }),
      adminClient.rpc("drikapex_is_owner_user", { p_user: targetUserId }),
    ]);
    if (actorProfileError || ownerError || permissionError || targetOwnerError) {
      return respond(request, 500, { error: "Could not verify the administrator profile." });
    }
    if (actorProfile?.status !== "ACTIVE") {
      return respond(request, 403, { error: "An active profile is required." });
    }
    if (isOwner !== true || canDelete !== true) {
      return respond(request, 403, { error: "Only the designated Owner can directly delete accounts." });
    }
    if (targetIsOwner === true) {
      return respond(request, 403, { error: "The designated Owner account cannot be deleted here." });
    }

    const { data: targetProfile, error: targetProfileError } =
      await adminClient
        .from("profiles")
        .select("id,display_name,username")
        .eq("id", targetUserId)
        .maybeSingle();
    if (targetProfileError || !targetProfile) {
      return respond(request, 404, { error: "The target profile was not found." });
    }

    const { error: deleteError } =
      await adminClient.auth.admin.deleteUser(targetUserId);
    if (deleteError) {
      return respond(request, 400, { error: "Supabase could not delete the account." });
    }
    const { error: auditError } = await adminClient.from("audit_logs").insert({
      user_id: actor.id,
      action: "DELETE_ACCOUNT",
      module: "ADMINISTRATION",
      target_type: "AUTH_USER",
      target_id: targetUserId,
      description: `Account ${targetProfile.username ?? targetProfile.display_name ?? targetUserId} deleted by authorized administrator.`,
    });
    if (auditError) {
      return respond(request, 200, {
        deleted: true,
        auditLogged: false,
        warning: "The account was deleted, but the audit event could not be saved.",
      });
    }
    return respond(request, 200, { deleted: true, auditLogged: true });
  } catch {
    return respond(request, 500, { error: "The account operation could not be completed." });
  }
});

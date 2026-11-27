import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const allowedOrigins = new Set(
  (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "http://localhost:3000")
    .split(",").map((origin) => origin.trim()).filter(Boolean),
);
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function respond(request: Request, status: number, body: Record<string, unknown> | null) {
  const origin = request.headers.get("Origin");
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      ...(origin && allowedOrigins.has(origin) ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      } : {}),
    },
  });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) return respond(request, 403, { error: "Origin is not allowed." });
  if (request.method === "OPTIONS") return respond(request, 204, null);
  if (request.method !== "POST") return respond(request, 405, { error: "Method not allowed." });
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return respond(request, 401, { error: "Authentication is required." });

  const { data: { user: actor }, error: authError } = await admin.auth.getUser(token);
  if (authError || !actor) return respond(request, 401, { error: "Invalid session." });
  const [{ data: canCreate, error: permissionError }, { data: owner, error: ownerError },
    { data: role, error: roleError }] = await Promise.all([
    admin.rpc("drikapex_user_has_permission", { p_user_id: actor.id, required_code: "users.create" }),
    admin.rpc("drikapex_is_owner_user", { p_user: actor.id }),
    admin.from("user_roles").select("role_id").eq("user_id", actor.id).eq("role_id", 1).maybeSingle(),
  ]);
  if (permissionError || ownerError || roleError) return respond(request, 503, { error: "Could not verify account creation access." });
  if (canCreate !== true || (!owner && !role)) return respond(request, 403, { error: "An authorized administrator is required." });

  let payload: unknown;
  try { payload = await request.json(); } catch { return respond(request, 400, { error: "Invalid JSON." }); }
  if (typeof payload !== "object" || payload === null ||
    !("email" in payload) || typeof payload.email !== "string" ||
    !("password" in payload) || typeof payload.password !== "string" ||
    !("username" in payload) || typeof payload.username !== "string" ||
    !("displayName" in payload) || typeof payload.displayName !== "string" ||
    !("roleId" in payload) || typeof payload.roleId !== "number" || !Number.isSafeInteger(payload.roleId)) {
    return respond(request, 400, { error: "Valid account details are required." });
  }
  const email = payload.email.trim().toLowerCase();
  const username = payload.username.trim().toLowerCase();
  const displayName = payload.displayName.trim();
  const roleId = payload.roleId;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !/^[a-z0-9._-]{3,64}$/.test(username) || displayName.length < 1 || displayName.length > 80 ||
    payload.password.length < 12 || payload.password.length > 128 ||
    roleId < 1) {
    return respond(request, 400, { error: "Invalid email, username, name, password, or role." });
  }
  if (roleId <= 1 && owner !== true) return respond(request, 403, { error: "Only the Owner may create administrators." });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password: payload.password, email_confirm: true,
  });
  if (createError || !created.user) {
    if (!createError?.status || createError.status >= 500) {
      return respond(request, 503, { error: "Auth did not confirm the result. Check the email in Supabase before retrying." });
    }
    return respond(request, 400, { error: "Could not create the Auth account. Check the email and try again." });
  }
  const userId = created.user.id;
  let provisionError: { code?: string } | null;
  try {
    ({ error: provisionError } = await admin.rpc("drikapex_provision_account", {
      p_actor: actor.id, p_user: userId, p_username: username,
      p_display_name: displayName, p_role_id: roleId,
    }));
  } catch (error) {
    console.error("Could not confirm account provisioning", userId, error);
    return respond(request, 503, { error: `Account setup status is unknown. The Owner must inspect Auth account ${userId} before retrying.` });
  }
  if (provisionError) {
    if (!provisionError.code || !/^[0-9A-Z]{5}$/.test(provisionError.code) || provisionError.code.startsWith("PGRST")) {
      console.error("Could not confirm account provisioning", userId, provisionError);
      return respond(request, 503, { error: `Account setup status is unknown. The Owner must inspect Auth account ${userId} before retrying.` });
    }
    const { error: cleanupError } = await admin.auth.admin.deleteUser(userId);
    if (cleanupError) {
      console.error("Could not remove incomplete newly created Auth account", userId, cleanupError);
      return respond(request, 500, { error: `Account setup failed and cleanup failed. The Owner must inspect Auth account ${userId}.` });
    }
    return respond(request, 400, { error: "Account setup failed. The username may already be in use, or access may have changed." });
  }
  return respond(request, 200, { created: true, userId });
});

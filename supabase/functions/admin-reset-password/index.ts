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
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return respond(request, 401, { error: "Invalid session." });

  const [{ data: owner, error: ownerError }, { data: profile, error: profileError }] = await Promise.all([
    admin.from("monthly_task_lock_owner").select("user_id").eq("user_id", user.id).maybeSingle(),
    admin.from("profiles").select("status").eq("id", user.id).maybeSingle(),
  ]);
  if (ownerError || profileError) return respond(request, 503, { error: "Could not verify Owner access." });
  if (!owner || profile?.status !== "ACTIVE") return respond(request, 403, { error: "Only the active designated Owner can reset passwords." });

  let payload: unknown;
  try { payload = await request.json(); } catch { return respond(request, 400, { error: "Invalid JSON." }); }
  if (typeof payload !== "object" || payload === null || !("targetUserId" in payload) ||
      typeof payload.targetUserId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.targetUserId) ||
      !("newPassword" in payload) || typeof payload.newPassword !== "string" ||
      payload.newPassword.length < 12 || payload.newPassword.length > 128) {
    return respond(request, 400, { error: "A valid user ID and a 12–128 character password are required." });
  }
  const { data: target, error: targetError } = await admin.from("profiles")
    .select("id").eq("id", payload.targetUserId).maybeSingle();
  if (targetError) return respond(request, 503, { error: "Could not verify target account." });
  if (!target) return respond(request, 404, { error: "Target account not found." });
  const { error: updateError } = await admin.auth.admin.updateUserById(payload.targetUserId, { password: payload.newPassword });
  if (updateError) return respond(request, 400, { error: "Password reset failed." });
  return respond(request, 200, { success: true, message: "Password reset successfully. Share it securely with the employee." });
});

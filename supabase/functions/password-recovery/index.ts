import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const hmacSecret = Deno.env.get("RECOVERY_HMAC_SECRET");
const origins = new Set((Deno.env.get("RECOVERY_ALLOWED_ORIGINS") ?? Deno.env.get("APP_ALLOWED_ORIGINS") ?? "").split(",").map((origin) => origin.trim()).filter(Boolean));
const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
const emailFrom = Deno.env.get("RECOVERY_EMAIL_FROM")?.trim();
const ownerInboxes = (Deno.env.get("RECOVERY_NOTIFY_EMAIL") ?? "").split(",").map((email) => email.trim()).filter((email) => /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email));
const emailEnabled = Boolean(resendKey && emailFrom && ownerInboxes.length);
const admin = url && serviceKey ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
const encoder = new TextEncoder();

function reply(request: Request, status: number, body: Record<string, unknown>): Response {
  const origin = request.headers.get("origin");
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Vary": "Origin",
      ...(origin && origins.has(origin) ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      } : {}),
    },
  });
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes instanceof Uint8Array ? bytes.buffer : bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

function randomPin(): string {
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= 4294960000);
  return String(values[0] % 10000).padStart(4, "0");
}

async function digest(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function keyed(value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(hmacSecret!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function validToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

async function emailPinToOwner(challengeHash: string): Promise<void> {
  const pin = randomPin();
  const pinHash = await keyed(`pin:${challengeHash}:${pin}`);
  const { data, error } = await admin!.rpc("password_recovery_email_issue", { p_challenge_hash: challengeHash, p_pin_hash: pinHash });
  if (error || !Array.isArray(data)) throw new Error("Could not prepare the recovery email");
  const target: unknown = data[0];
  if (!target) return;
  if (typeof target !== "object" || !("target_name" in target) || !("target_email" in target) || !("pin_expires_at" in target) ||
    typeof target.target_name !== "string" || typeof target.target_email !== "string" || typeof target.pin_expires_at !== "string") {
    throw new Error("Invalid recovery email target");
  }
  const expiresAt = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(new Date(target.pin_expires_at));
  const name = target.target_name;
  const email = target.target_email;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from: emailFrom,
        to: ownerInboxes,
        subject: `Yêu cầu khôi phục mật khẩu: ${name}`,
        text: [
          `${name} (${email}) vừa yêu cầu khôi phục mật khẩu DRIKAPEX Internal.`,
          "",
          `Mã PIN: ${pin}`,
          `Hiệu lực đến: ${expiresAt} (giờ Việt Nam). Mã dùng một lần, tối đa 5 lần nhập.`,
          "Nếu nhận nhiều email cho cùng một nhân sự, chỉ mã trong email mới nhất còn hiệu lực.",
          "",
          "Chỉ cung cấp mã sau khi đã xác minh đúng người yêu cầu qua kênh liên hệ riêng. Nếu yêu cầu không hợp lệ, hãy bỏ qua email này; mã sẽ tự hết hạn.",
        ].join("\n"),
        html: `<div style="font-family:Arial,sans-serif;color:#1f2933;max-width:520px">
<h2 style="margin:0 0 12px">Yêu cầu khôi phục mật khẩu</h2>
<p><strong>${escapeHtml(name)}</strong> (${escapeHtml(email)}) vừa yêu cầu khôi phục mật khẩu DRIKAPEX Internal.</p>
<p style="font-size:32px;font-weight:700;letter-spacing:10px;margin:20px 0">${pin}</p>
<p>Hiệu lực đến <strong>${escapeHtml(expiresAt)}</strong> (giờ Việt Nam). Mã dùng một lần, tối đa 5 lần nhập.</p>
<p>Nếu nhận nhiều email cho cùng một nhân sự, chỉ mã trong email mới nhất còn hiệu lực.</p>
<p style="color:#52606d">Chỉ cung cấp mã sau khi đã xác minh đúng người yêu cầu qua kênh liên hệ riêng. Nếu yêu cầu không hợp lệ, hãy bỏ qua email này; mã sẽ tự hết hạn.</p>
</div>`,
      }),
    });
    if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
  } catch (cause) {
    const { error: releaseError } = await admin!.rpc("password_recovery_email_release", { p_challenge_hash: challengeHash, p_pin_hash: pinHash });
    if (releaseError) console.error("Undelivered recovery PIN could not be returned to the owner queue.");
    throw cause;
  }
}

async function readBody(request: Request): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 8192) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin && !origins.has(origin)) return reply(request, 403, { error: "Origin is not allowed." });
  if (request.method === "OPTIONS") return reply(request, 200, {});
  if (request.method !== "POST") return reply(request, 405, { error: "Method not allowed." });
  if (!admin || !hmacSecret || hmacSecret.length < 32 || !origins.size) {
    return reply(request, 503, { code: "RECOVERY_NOT_CONFIGURED", error: "Password recovery is not configured." });
  }

  try {
    const text = await readBody(request);
    if (text === null) return reply(request, 400, { error: "Invalid request." });
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { return reply(request, 400, { error: "Invalid request." }); }
    if (!payload || typeof payload !== "object" || !("action" in payload)) return reply(request, 400, { error: "Invalid request." });

    if (payload.action === "owner-list" || payload.action === "owner-issue") {
      const accessToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (!accessToken) return reply(request, 401, { error: "Sign in as the owner." });
      const { data: auth, error: authError } = await admin.auth.getUser(accessToken);
      if (authError || !auth.user) return reply(request, 401, { error: "Sign in as the owner." });
      const { data: isOwner, error: roleError } = await admin.rpc("password_recovery_is_owner", { p_actor: auth.user.id });
      if (roleError) throw new Error("Could not verify owner access");
      if (isOwner !== true) return reply(request, 403, { error: "Only the owner can issue recovery PINs." });
      if (payload.action === "owner-list") {
        const { data, error } = await admin.rpc("password_recovery_owner_requests", { p_actor: auth.user.id });
        if (error || !Array.isArray(data)) throw new Error("Could not load recovery requests");
        return reply(request, 200, { requests: data });
      }
      if (!("requestId" in payload) || !validToken(payload.requestId)) return reply(request, 400, { error: "Invalid request." });
      const pin = randomPin();
      const { data, error } = await admin.rpc("password_recovery_issue", {
        p_actor: auth.user.id,
        p_challenge_hash: payload.requestId,
        p_pin_hash: await keyed(`pin:${payload.requestId}:${pin}`),
      });
      if (error || typeof data !== "boolean") throw new Error("Could not issue recovery PIN");
      if (!data) return reply(request, 409, { error: "Request expired or PIN already issued." });
      return reply(request, 200, { pin });
    }

    if (payload.action === "request") {
      if (!("email" in payload) || typeof payload.email !== "string") return reply(request, 400, { error: "Invalid email." });
      const email = payload.email.trim().toLowerCase();
      if (email.length > 254 || !/^[\x21-\x7e]+$/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(request, 400, { error: "Invalid email." });
      const challenge = randomToken();
      const challengeHash = await digest(challenge);
      const { data, error } = await admin.rpc("password_recovery_request", {
        p_account_key: await keyed(`account:${email}`),
        p_email: email,
        p_challenge_hash: challengeHash,
      });
      if (error || typeof data !== "string") throw new Error("Recovery request failed");
      const limited = /^limited(?::(\d{1,6}))?$/.exec(data);
      if (limited) {
        const retryAfter = Math.min(Math.max(Number(limited[1] ?? 60), 1), 3600);
        return reply(request, 429, { error: "Please wait before trying again.", retryAfter });
      }
      if (data !== "queued") throw new Error("Recovery request failed");
      if (emailEnabled) {
        // Delivery runs after the response so eligible and unknown accounts look identical to the requester.
        const delivery = emailPinToOwner(challengeHash).catch(() => console.error("Recovery PIN email was not delivered."));
        const runtime = (globalThis as { EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void } }).EdgeRuntime;
        if (runtime) runtime.waitUntil(delivery); else await delivery;
      }
      return reply(request, 200, { challenge });
    }

    if (payload.action === "verify") {
      if (!("challenge" in payload) || !validToken(payload.challenge) || !("pin" in payload) ||
        typeof payload.pin !== "string" || !/^\d{4}$/.test(payload.pin)) return reply(request, 400, { error: "Invalid PIN." });
      const resetToken = randomToken();
      const challengeHash = await digest(payload.challenge);
      const { data, error } = await admin.rpc("password_recovery_verify", {
        p_challenge_hash: challengeHash,
        p_pin_hash: await keyed(`pin:${challengeHash}:${payload.pin}`),
        p_reset_hash: await digest(resetToken),
      });
      if (error || typeof data !== "boolean") throw new Error("Recovery verification failed");
      if (!data) return reply(request, 400, { error: "PIN invalid or expired." });
      return reply(request, 200, { resetToken });
    }

    if (payload.action === "update") {
      if (!("resetToken" in payload) || !validToken(payload.resetToken) || !("password" in payload) ||
        typeof payload.password !== "string" || payload.password.length < 8 || payload.password.length > 1024) {
        return reply(request, 400, { error: "Invalid password or recovery session." });
      }
      const { data: userId, error: consumeError } = await admin.rpc("password_recovery_consume", { p_reset_hash: await digest(payload.resetToken) });
      if (consumeError) throw new Error("Recovery authorization failed");
      if (typeof userId !== "string") return reply(request, 400, { error: "Recovery session expired." });
      const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password: payload.password });
      if (updateError) {
        console.error("Could not update the recovered account password.");
        return reply(request, 503, { error: "Password update failed. Request a new PIN." });
      }
      return reply(request, 200, { updated: true });
    }

    return reply(request, 400, { error: "Invalid request." });
  } catch {
    console.error("Password recovery request failed.");
    return reply(request, 503, { error: "Password recovery is temporarily unavailable." });
  }
});

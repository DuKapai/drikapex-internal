import { getSupabaseClient } from "@/supabase/client";

type RecoveryAction = "request" | "verify" | "update" | "owner-list" | "owner-issue";

export type RecoveryRequest = {
  request_id: string;
  display_name: string;
  email: string;
  requested_at: string;
  expires_at: string;
  issued: boolean;
  emailed: boolean;
};

export class RecoveryCooldownError extends Error {
  readonly retryAfter: number;

  constructor(retryAfter: number) {
    super("Please wait for the timer to end before requesting another PIN.");
    this.name = "RecoveryCooldownError";
    this.retryAfter = retryAfter;
  }
}

async function invoke(action: RecoveryAction, payload: Record<string, string>): Promise<unknown> {
  const { data, error } = await getSupabaseClient().functions.invoke("password-recovery", {
    body: { action, ...payload },
  });
  if (error) {
    const context: unknown = "context" in error ? error.context : null;
    const status = context instanceof Response ? context.status : 0;
    if (status === 429 && action === "request" && context instanceof Response) {
      const body: unknown = await context.clone().json().catch(() => null);
      const seconds = body && typeof body === "object" && "retryAfter" in body && typeof body.retryAfter === "number" &&
        Number.isFinite(body.retryAfter) ? body.retryAfter : 60;
      throw new RecoveryCooldownError(Math.min(Math.max(Math.ceil(seconds), 1), 3600));
    }
    if (status === 429) throw new Error("Too many recovery attempts. Please wait before trying again.");
    if (status === 400 && action === "verify") throw new Error("The PIN is incorrect, expired, or has reached the attempt limit.");
    if (status === 400 && action === "update") throw new Error("The recovery session expired. Request a new PIN.");
    if (status === 404) throw new Error("PIN recovery is not deployed to Supabase yet. Contact the administrator.");
    if (status === 401 || status === 403) throw new Error("Sign in with an active owner account to manage PIN requests.");
    if (status === 409) throw new Error("This request expired or its PIN was already issued. Refresh the list.");
    if (status === 503 && context instanceof Response) {
      const body: unknown = await context.clone().json().catch(() => null);
      if (body && typeof body === "object" && "code" in body && body.code === "RECOVERY_NOT_CONFIGURED") {
        throw new Error("PIN recovery is deployed but not configured yet. Contact the administrator.");
      }
    }
    if (action === "owner-issue") throw new Error("PIN issuance could not be confirmed. Refresh the list before trying again.");
    if (action === "update") throw new Error("Password update could not be confirmed. Try signing in with the new password before requesting a new PIN.");
    throw new Error("Password recovery is unavailable. Contact the administrator.");
  }
  return data;
}

export async function loadRecoveryRequests(): Promise<RecoveryRequest[]> {
  const data = await invoke("owner-list", {});
  if (!data || typeof data !== "object" || !("requests" in data) || !Array.isArray(data.requests)) {
    throw new Error("Password recovery returned an invalid response.");
  }
  return data.requests.map((row: unknown) => {
    if (!row || typeof row !== "object" || !("request_id" in row) || !("display_name" in row) ||
      !("email" in row) || !("requested_at" in row) || !("expires_at" in row) || !("issued" in row) ||
      typeof row.request_id !== "string" || !/^[a-f0-9]{64}$/.test(row.request_id) ||
      typeof row.display_name !== "string" || typeof row.email !== "string" ||
      typeof row.requested_at !== "string" || !Number.isFinite(Date.parse(row.requested_at)) ||
      typeof row.expires_at !== "string" || !Number.isFinite(Date.parse(row.expires_at)) || typeof row.issued !== "boolean") {
      throw new Error("Password recovery returned an invalid response.");
    }
    return { request_id: row.request_id, display_name: row.display_name, email: row.email,
      requested_at: row.requested_at, expires_at: row.expires_at, issued: row.issued,
      emailed: "emailed" in row && row.emailed === true };
  });
}

export async function issueRecoveryPin(requestId: string): Promise<string> {
  const data = await invoke("owner-issue", { requestId });
  if (!data || typeof data !== "object" || !("pin" in data) || typeof data.pin !== "string" || !/^\d{4}$/.test(data.pin)) {
    throw new Error("PIN issuance could not be confirmed. Refresh the list before trying again.");
  }
  return data.pin;
}

function token(data: unknown, key: "challenge" | "resetToken"): string {
  const value = data && typeof data === "object"
    ? key === "challenge" && "challenge" in data ? data.challenge
      : key === "resetToken" && "resetToken" in data ? data.resetToken : undefined
    : undefined;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("Password recovery returned an invalid response.");
  }
  return value;
}

export async function requestRecoveryPin(email: string): Promise<string> {
  return token(await invoke("request", { email }), "challenge");
}

export async function verifyRecoveryPin(challenge: string, pin: string): Promise<string> {
  return token(await invoke("verify", { challenge, pin }), "resetToken");
}

export async function updatePasswordWithRecoveryPin(resetToken: string, password: string): Promise<void> {
  const data = await invoke("update", { resetToken, password });
  if (!data || typeof data !== "object" || !("updated" in data) || data.updated !== true) {
    throw new Error("Password update could not be confirmed. Try signing in with the new password before requesting a new PIN.");
  }
}

import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

type Handler = (request: Request) => Promise<Response>;

function setup(extraSecrets: Record<string, string> = {}) {
  const rpc = vi.fn();
  const updateUserById = vi.fn();
  const getUser = vi.fn();
  const fetch = vi.fn();
  let handler: Handler = async () => { throw new Error("Handler was not registered"); };
  const secrets: Record<string, string> = {
    SUPABASE_URL: "https://example.test",
    SUPABASE_SERVICE_ROLE_KEY: "test-key",
    RECOVERY_HMAC_SECRET: "x".repeat(32),
    APP_ALLOWED_ORIGINS: "http://localhost:3000",
    ...extraSecrets,
  };
  const source = readFileSync("supabase/functions/password-recovery/index.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, {
    exports: {},
    require: () => ({ createClient: () => ({ rpc, auth: { getUser, admin: { updateUserById } } }) }),
    Deno: { env: { get: (name: string) => secrets[name] }, serve: (fn: Handler) => { handler = fn; } },
    crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, Uint32Array, ArrayBuffer,
    Request, Response, AbortSignal, console, fetch,
  });
  const call = (payload: unknown) => handler(new Request("http://localhost/function", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json", Authorization: "Bearer test-token" },
    body: JSON.stringify(payload),
  }));
  return { rpc, updateUserById, getUser, fetch, call, handler };
}

const emailSecrets = {
  RESEND_API_KEY: "test-resend-key",
  RECOVERY_EMAIL_FROM: "Drikapex <no-reply@example.test>",
  RECOVERY_NOTIFY_EMAIL: "owner@example.test",
};

async function pinHash(challengeHash: string, pin: string): Promise<string> {
  const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode("x".repeat(32)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Buffer.from(await webcrypto.subtle.sign("HMAC", key, new TextEncoder().encode(`pin:${challengeHash}:${pin}`))).toString("hex");
}

describe("password recovery edge function", () => {
  it("queues a request without any email configuration and does not expose a PIN", async () => {
    const { rpc, call } = setup();
    rpc.mockResolvedValue({ data: "queued", error: null });
    const response = await call({ action: "request", email: "Staff@Example.test" });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.challenge).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(body)).toEqual(["challenge"]);
    expect(rpc.mock.calls[0][1].p_email).toBe("staff@example.test");
    expect(rpc.mock.calls[0][1].p_challenge_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns an indistinguishable challenge for an unknown account", async () => {
    const { rpc, call } = setup();
    rpc.mockResolvedValue({ data: "queued", error: null });
    const response = await call({ action: "request", email: "nobody@example.test" });
    expect(response.status).toBe(200);
    expect((await response.json()).challenge).toMatch(/^[a-f0-9]{64}$/);
  });

  it("tells a rate-limited requester how long to wait without sending a PIN", async () => {
    const { rpc, fetch, call } = setup(emailSecrets);
    rpc.mockResolvedValueOnce({ data: "limited:42", error: null })
      .mockResolvedValueOnce({ data: "limited", error: null })
      .mockResolvedValueOnce({ data: "limited:99999", error: null });
    const first = await call({ action: "request", email: "staff@example.test" });
    expect(first.status).toBe(429);
    expect(await first.json()).toEqual({ error: "Please wait before trying again.", retryAfter: 42 });
    expect((await (await call({ action: "request", email: "staff@example.test" })).json()).retryAfter).toBe(60);
    expect((await (await call({ action: "request", email: "staff@example.test" })).json()).retryAfter).toBe(3600);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("emails an eligible account's PIN only to the configured owner inbox", async () => {
    const { rpc, fetch, call } = setup(emailSecrets);
    rpc.mockResolvedValueOnce({ data: "queued", error: null })
      .mockResolvedValueOnce({ data: [{ target_name: "<Staff>", target_email: "staff@example.test", pin_expires_at: "2026-11-20T01:00:00Z" }], error: null })
      .mockResolvedValueOnce({ data: "queued", error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    fetch.mockResolvedValue(new Response("{}", { status: 200 }));
    const response = await call({ action: "request", email: "staff@example.test" });
    expect(Object.keys(await response.json())).toEqual(["challenge"]);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const mail = JSON.parse(init.body);
    expect(mail.to).toEqual(["owner@example.test"]);
    const pin = mail.text.match(/Mã PIN: (\d{4})/)[1];
    expect(mail.subject).not.toContain(pin);
    expect(mail.html).toContain("&#60;Staff&#62;");
    const challengeHash = rpc.mock.calls[0][1].p_challenge_hash;
    expect(rpc.mock.calls[1][1]).toEqual({ p_challenge_hash: challengeHash, p_pin_hash: await pinHash(challengeHash, pin) });

    const unknown = await call({ action: "request", email: "nobody@example.test" });
    expect(unknown.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns the request to the owner queue when email delivery fails", async () => {
    const { rpc, fetch, call } = setup(emailSecrets);
    rpc.mockResolvedValueOnce({ data: "queued", error: null })
      .mockResolvedValueOnce({ data: [{ target_name: "Staff", target_email: "staff@example.test", pin_expires_at: "2026-11-20T01:00:00Z" }], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    fetch.mockResolvedValue(new Response("{}", { status: 500 }));
    const response = await call({ action: "request", email: "staff@example.test" });
    expect(response.status).toBe(200);
    expect(rpc.mock.calls[2][0]).toBe("password_recovery_email_release");
    expect(rpc.mock.calls[2][1]).toEqual(rpc.mock.calls[1][1]);
  });

  it("denies a member and invalid session access to owner actions", async () => {
    const { rpc, getUser, call } = setup();
    getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("invalid") })
      .mockResolvedValue({ data: { user: { id: "member" } }, error: null });
    rpc.mockResolvedValue({ data: false, error: null });
    expect((await call({ action: "owner-list" })).status).toBe(401);
    expect((await call({ action: "owner-issue", requestId: "a".repeat(64) })).status).toBe(403);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("password_recovery_is_owner");
  });

  it("binds the issued PIN to its request and trusts only the authenticated owner identity", async () => {
    const { rpc, getUser, call } = setup();
    getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
    rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const requestId = "a".repeat(64);
    const response = await call({ action: "owner-issue", requestId, actorId: "forged" });
    expect(response.status).toBe(200);
    const { pin } = await response.json();
    expect(pin).toMatch(/^\d{4}$/);
    expect(rpc.mock.calls[1][1].p_actor).toBe("owner");
    expect(rpc.mock.calls[1][1].p_pin_hash).toBe(await pinHash(requestId, pin));
  });

  it("never updates Auth when authorization fails, and reports an Auth update failure", async () => {
    const { rpc, updateUserById, call } = setup();
    const payload = { action: "update", resetToken: "a".repeat(64), password: "new password" };
    rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: "test-user", error: null });
    expect((await call(payload)).status).toBe(400);
    expect(updateUserById).not.toHaveBeenCalled();
    updateUserById.mockResolvedValue({ error: new Error("update failed") });
    expect((await call(payload)).status).toBe(503);
  });

  it("rejects a wrong PIN and consumes authorization before changing a password", async () => {
    const { rpc, updateUserById, call } = setup();
    rpc.mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: "test-user", error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const challenge = "a".repeat(64);
    expect((await call({ action: "verify", challenge, pin: "1111" })).status).toBe(400);
    const verified = await call({ action: "verify", challenge, pin: "0123" });
    const { resetToken } = await verified.json();
    expect(resetToken).toMatch(/^[a-f0-9]{64}$/);
    updateUserById.mockResolvedValue({ error: null });
    const updated = await call({ action: "update", resetToken, password: "example password" });
    expect(await updated.json()).toEqual({ updated: true });
    expect(updateUserById).toHaveBeenCalledWith("test-user", { password: "example password" });
    expect((await call({ action: "update", resetToken, password: "example password" })).status).toBe(400);
    expect(updateUserById).toHaveBeenCalledTimes(1);
  });

  it("rejects unapproved origins and oversized requests", async () => {
    const { handler, call, rpc } = setup();
    const forbidden = await handler(new Request("http://localhost/function", {
      method: "POST", headers: { origin: "https://evil.example.test" }, body: "{}",
    }));
    expect(forbidden.status).toBe(403);
    expect((await call({ action: "request", email: "a".repeat(8192) })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});

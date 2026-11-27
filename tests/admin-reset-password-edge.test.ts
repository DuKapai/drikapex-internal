import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

type Handler = (request: Request) => Promise<Response>;

function setup() {
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "actor" } }, error: null });
  const updateUserById = vi.fn().mockResolvedValue({ error: null });
  const rows: Record<string, { data: unknown; error: unknown }> = {
    monthly_task_lock_owner: { data: null, error: null },
    profiles: { data: { status: "ACTIVE" }, error: null },
  };
  let handler: Handler = async () => { throw new Error("Handler was not registered"); };
  const source = readFileSync("supabase/functions/admin-reset-password/index.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, {
    exports: {},
    require: () => ({ createClient: () => ({
      auth: { getUser, admin: { updateUserById } },
      from: (table: string) => ({
        select: () => ({ eq: (_key: string, value: string) => ({
          maybeSingle: async () => table === "profiles" && value !== "actor"
            ? { data: { id: value }, error: null } : rows[table],
        }) }),
      }),
    }) }),
    Deno: { env: { get: (name: string) => ({
      SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "test-key",
    })[name] }, serve: (fn: Handler) => { handler = fn; } },
    Request, Response, console,
  });
  const call = () => handler(new Request("http://localhost/function", {
    method: "POST",
    headers: { authorization: "Bearer token", "content-type": "application/json" },
    body: JSON.stringify({ targetUserId: "12345678-1234-1234-1234-123456789abc", newPassword: "long-password-123" }),
  }));
  return { rows, getUser, updateUserById, call };
}

describe("admin password reset", () => {
  it("denies any account not recorded as the active designated Owner", async () => {
    const { call, updateUserById, rows } = setup();
    expect((await call()).status).toBe(403);
    rows.monthly_task_lock_owner.data = { user_id: "actor" };
    rows.profiles.data = { status: "DISABLED" };
    expect((await call()).status).toBe(403);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("fails closed when the owner record cannot be checked", async () => {
    const { call, updateUserById, rows } = setup();
    rows.monthly_task_lock_owner.error = new Error("database unavailable");
    expect((await call()).status).toBe(503);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("allows the active designated Owner to reset an existing account", async () => {
    const { call, updateUserById, rows } = setup();
    rows.monthly_task_lock_owner.data = { user_id: "actor" };
    expect((await call()).status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith(
      "12345678-1234-1234-1234-123456789abc", { password: "long-password-123" },
    );
  });
});

import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

type Handler = (request: Request) => Promise<Response>;

function setup() {
  const state = { allowed: true, owner: false, admin: true };
  const createUser = vi.fn().mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
  const deleteUser = vi.fn().mockResolvedValue({ error: null });
  const provision = vi.fn().mockResolvedValue({ error: null });
  let handler: Handler = async () => { throw new Error("Handler was not registered"); };
  const source = readFileSync("supabase/functions/create-account/index.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, {
    exports: {},
    require: () => ({ createClient: () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: "actor" } }, error: null }),
        admin: { createUser, deleteUser },
      },
      rpc: (name: string, args: unknown) => name === "drikapex_user_has_permission"
        ? Promise.resolve({ data: state.allowed, error: null })
        : name === "drikapex_is_owner_user"
          ? Promise.resolve({ data: state.owner, error: null })
          : provision(args),
      from: () => ({ select: () => ({ eq: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: state.admin ? { role_id: 1 } : null, error: null }),
      }) }) }) }),
    }) }),
    Deno: { env: { get: (name: string) => ({
      SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "test-key",
    })[name] }, serve: (fn: Handler) => { handler = fn; } },
    Request, Response, console,
  });
  const call = (roleId = 3) => handler(new Request("http://localhost/function", {
    method: "POST",
    headers: { authorization: "Bearer token", "content-type": "application/json" },
    body: JSON.stringify({ email: "Staff@example.com", username: "staff0005",
      displayName: "Staff", password: "example-password", roleId }),
  }));
  return { state, createUser, deleteUser, provision, call };
}

describe("create-account Edge Function", () => {
  it("denies callers without creation permission and non-owner administrator creation", async () => {
    const { state, call, createUser } = setup();
    state.allowed = false;
    expect((await call()).status).toBe(403);
    state.allowed = true;
    expect((await call(1)).status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("creates Auth and provisions a profile and role without persisting the password elsewhere", async () => {
    const { call, createUser, provision, deleteUser } = setup();
    expect((await call()).status).toBe(200);
    expect(createUser).toHaveBeenCalledWith({
      email: "staff@example.com", password: "example-password", email_confirm: true,
    });
    expect(provision).toHaveBeenCalledWith({
      p_actor: "actor", p_user: "new-user", p_username: "staff0005",
      p_display_name: "Staff", p_role_id: 3,
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("removes the newly created Auth account after a confirmed database rejection", async () => {
    const { call, provision, deleteUser } = setup();
    provision.mockResolvedValue({ error: { code: "23505" } });
    expect((await call()).status).toBe(400);
    expect(deleteUser).toHaveBeenCalledWith("new-user");
  });

  it("does not delete an account if provisioning outcome is unknown", async () => {
    const { call, provision, deleteUser } = setup();
    provision.mockResolvedValue({ error: { code: "" } });
    const response = await call();
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("new-user");
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

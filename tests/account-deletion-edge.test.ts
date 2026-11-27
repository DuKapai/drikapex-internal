import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

type Handler = (request: Request) => Promise<Response>;
const actor = "12345678-1234-4234-8234-123456789abc";
const target = "87654321-4321-4321-8321-cba987654321";

function setup(file: "delete-account" | "account-deletion-workflow") {
  const state = { owner: false, allowed: true, actorLevel: 1, targetIsOwner: false, status: "APPROVED" };
  const deleteUser = vi.fn().mockResolvedValue({ error: null });
  const insertRequest = vi.fn().mockResolvedValue({ data: { id: 8, status: "PENDING" }, error: null });
  let handler: Handler = async () => { throw new Error("Handler was not registered"); };
  function from(table: string) {
    let selected = "";
    let action = "select";
    let payload: Record<string, unknown> = {};
    const filters: Record<string, unknown> = {};
    function result() {
      if (table === "profiles") return { data: selected === "status" ? { status: "ACTIVE" } : { id: target, display_name: "Member", username: "member" }, error: null };
      if (table === "user_roles") return { data: [{ role_id: state.actorLevel, roles: { id: state.actorLevel, code: "ROLE" } }], error: null };
      if (table === "monthly_task_lock_owner") return { data: state.targetIsOwner ? { user_id: target } : null, error: null };
      if (table === "account_deletion_requests" && action === "insert") return insertRequest();
      if (table === "account_deletion_requests" && action === "update") return { data: { id: 8, status: payload.status }, error: null };
      if (table === "account_deletion_requests") return { data: { id: 8, requested_by: actor, target_user_id: target, status: state.status }, error: null };
      return { data: null, error: null };
    }
    const query = {
      select: (columns: string) => { selected = columns; return query; },
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      maybeSingle: async () => result(),
      single: async () => result(),
      insert: (value: Record<string, unknown>) => { action = "insert"; payload = value; return query; },
      update: (value: Record<string, unknown>) => { action = "update"; payload = value; return query; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
  }
  const source = readFileSync(`supabase/functions/${file}/index.ts`, "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, {
    exports: {},
    require: () => ({ createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: actor } }, error: null }), admin: { deleteUser } },
      from,
      rpc: async (name: string, args: { p_user?: string }) => ({
        data: name === "drikapex_is_owner_user" ? args.p_user === actor && state.owner : state.allowed,
        error: null,
      }),
    }) }),
    Deno: { env: { get: (name: string) => ({
      SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "test-key",
    })[name] }, serve: (fn: Handler) => { handler = fn; } },
    Request, Response, console,
  });
  const call = (body: Record<string, unknown>) => handler(new Request("http://localhost/function", {
    method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { state, deleteUser, insertRequest, call };
}

describe("account deletion authorization", () => {
  it("allows direct deletion only for the designated Owner", async () => {
    const { state, call, deleteUser } = setup("delete-account");
    expect((await call({ userId: target })).status).toBe(403);
    state.owner = true;
    expect((await call({ userId: target })).status).toBe(200);
    expect(deleteUser).toHaveBeenCalledTimes(1);
  });

  it("requires approval before an administrator can execute deletion", async () => {
    const { state, call, deleteUser } = setup("account-deletion-workflow");
    state.status = "PENDING";
    expect((await call({ action: "execute", requestId: 8 })).status).toBe(409);
    expect(deleteUser).not.toHaveBeenCalled();
    state.status = "APPROVED";
    expect((await call({ action: "execute", requestId: 8 })).status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith(target);
  });

  it("rejects member requests and non-owner reviews", async () => {
    const { state, call, insertRequest } = setup("account-deletion-workflow");
    state.actorLevel = 3;
    expect((await call({ action: "request", targetUserId: target })).status).toBe(403);
    state.actorLevel = 1;
    state.status = "PENDING";
    expect((await call({ action: "approve", requestId: 8 })).status).toBe(403);
    expect(insertRequest).not.toHaveBeenCalled();
  });

  it("allows requests for other administrators but never for the designated Owner", async () => {
    const { state, call, insertRequest } = setup("account-deletion-workflow");
    expect((await call({ action: "request", targetUserId: target })).status).toBe(200);
    state.targetIsOwner = true;
    expect((await call({ action: "request", targetUserId: target })).status).toBe(403);
    expect(insertRequest).toHaveBeenCalledTimes(1);
  });
});

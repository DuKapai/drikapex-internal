import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: mocks.invoke } }),
}));

import { RecoveryCooldownError, requestRecoveryPin, verifyRecoveryPin, updatePasswordWithRecoveryPin } from "../supabase/password-recovery-api";

beforeEach(() => vi.resetAllMocks());

describe("password recovery API", () => {
  it("requests and verifies a PIN using server-issued capabilities", async () => {
    const challenge = "a".repeat(64);
    const resetToken = "b".repeat(64);
    mocks.invoke.mockResolvedValueOnce({ data: { challenge }, error: null })
      .mockResolvedValueOnce({ data: { resetToken }, error: null });
    await expect(requestRecoveryPin("staff@example.test")).resolves.toBe(challenge);
    await expect(verifyRecoveryPin(challenge, "0123")).resolves.toBe(resetToken);
    expect(mocks.invoke).toHaveBeenLastCalledWith("password-recovery", {
      body: { action: "verify", challenge, pin: "0123" },
    });
  });

  it("rejects malformed or unavailable responses rather than claiming success", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { challenge: "invalid" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { context: new Response(null, { status: 429 }) } })
      .mockResolvedValueOnce({ data: {}, error: null });
    await expect(requestRecoveryPin("staff@example.test")).rejects.toThrow("invalid response");
    await expect(verifyRecoveryPin("a".repeat(64), "0000")).rejects.toThrow("Too many");
    await expect(updatePasswordWithRecoveryPin("b".repeat(64), "new password")).rejects.toThrow("could not be confirmed");
  });

  it("reports the server's resend wait time for a rate-limited PIN request", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { context: Response.json({ retryAfter: 42.2 }, { status: 429 }) } })
      .mockResolvedValueOnce({ data: null, error: { context: new Response(null, { status: 429 }) } });
    const limited = await requestRecoveryPin("staff@example.test").catch((error: unknown) => error);
    expect(limited).toBeInstanceOf(RecoveryCooldownError);
    expect((limited as RecoveryCooldownError).retryAfter).toBe(43);
    await expect(requestRecoveryPin("staff@example.test")).rejects.toMatchObject({ retryAfter: 60 });
  });

  it("explains when recovery is missing from Supabase or has incomplete server configuration", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { context: new Response(null, { status: 404 }) } })
      .mockResolvedValueOnce({ data: null, error: { context: Response.json({ code: "RECOVERY_NOT_CONFIGURED" }, { status: 503 }) } });
    await expect(requestRecoveryPin("staff@example.test")).rejects.toThrow("not deployed");
    await expect(requestRecoveryPin("staff@example.test")).rejects.toThrow("not configured");
  });

  it("does not mislabel a temporary server failure as missing configuration", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: Response.json({ error: "temporary" }, { status: 503 }) } });
    await expect(updatePasswordWithRecoveryPin("b".repeat(64), "new password")).rejects.toThrow("could not be confirmed");
  });
});

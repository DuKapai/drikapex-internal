import { describe, expect, it } from "vitest";
import { isSupportedWorkDevice } from "../lib/work-device";

describe("isSupportedWorkDevice", () => {
  it("allows desktop computers and laptops", () => {
    expect(
      isSupportedWorkDevice({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        maxTouchPoints: 0,
        screenWidth: 1440,
      }),
    ).toBe(true);
  });

  it("allows iPadOS and Android tablets", () => {
    expect(
      isSupportedWorkDevice({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
        maxTouchPoints: 5,
        screenWidth: 820,
      }),
    ).toBe(true);
    expect(
      isSupportedWorkDevice({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Tablet)",
        maxTouchPoints: 10,
        screenWidth: 800,
      }),
    ).toBe(true);
  });

  it("blocks phones, including small touch devices using desktop mode", () => {
    expect(
      isSupportedWorkDevice({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
        maxTouchPoints: 5,
        screenWidth: 390,
      }),
    ).toBe(false);
    expect(
      isSupportedWorkDevice({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
        maxTouchPoints: 5,
        screenWidth: 390,
      }),
    ).toBe(false);
  });
});

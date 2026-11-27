import { describe, expect, it } from "vitest";
import { translateText } from "../components/language-provider";

describe("translateText", () => {
  it("uses Vietnamese as the default translation and supports English", () => {
    expect(translateText("Welcome back.", "vi")).toBe("Chào mừng bạn trở lại.");
    expect(translateText("Chào mừng bạn trở lại.", "en")).toBe("Welcome back.");
  });

  it("keeps dynamic names and counts intact while translating surrounding text", () => {
    expect(translateText("Welcome, Minh", "vi")).toBe("Chào mừng, Minh");
    expect(translateText("People · 12", "vi")).toBe("Nhân sự · 12");
    expect(translateText("Nhân sự · 12", "en")).toBe("People · 12");
    expect(translateText("3 ACTIVE PROFILES", "vi")).toBe("3 hồ sơ đang hoạt động");
    expect(translateText("3 hồ sơ đang hoạt động", "en")).toBe("3 ACTIVE PROFILES");
  });

  it("leaves database codes and unrecognized content unchanged in English", () => {
    expect(translateText("ACTIVE", "en")).toBe("ACTIVE");
    expect(translateText("Custom company label", "vi")).toBe("Custom company label");
  });

  it("translates login controls and password visibility labels", () => {
    expect(translateText("Show password", "vi")).toBe("Hiện mật khẩu");
    expect(translateText("Ẩn mật khẩu", "en")).toBe("Hide password");
    expect(translateText("Send reset link", "vi")).toBe("Gửi liên kết đặt lại");
    expect(translateText("DRIKAPEX · INTERNAL HEADQUARTERS", "vi")).toBe(
      "DRIKAPEX · TRỤ SỞ NỘI BỘ",
    );
  });

  it("translates the new office camera controls and area label", () => {
    expect(translateText("Zoom in", "vi")).toBe("Phóng to");
    expect(translateText("Reset 3D view", "vi")).toBe("Đặt lại góc nhìn 3D");
    expect(translateText("150 m² · SCALE MODEL 1:1.53", "vi")).toBe(
      "150 m² · TỶ LỆ MÔ HÌNH 1:1,53",
    );
    expect(translateText("Phóng to", "en")).toBe("Zoom in");
  });
});

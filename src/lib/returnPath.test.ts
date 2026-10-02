import { describe, expect, it } from "vitest";

import { toSafeReturnPath } from "@/lib/returnPath";

describe("toSafeReturnPath", () => {
  it("godtar interne stier", () => {
    expect(toSafeReturnPath("/onboarding?step=2", "/dashboard")).toBe("/onboarding?step=2");
  });

  it("avviser eksterne og protokollrelative adresser", () => {
    expect(toSafeReturnPath("https://evil.example", "/dashboard")).toBe("/dashboard");
    expect(toSafeReturnPath("//evil.example", "/dashboard")).toBe("/dashboard");
    expect(toSafeReturnPath("/\\evil.example", "/dashboard")).toBe("/dashboard");
    expect(toSafeReturnPath(null, "/dashboard")).toBe("/dashboard");
  });
});

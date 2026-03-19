import { describe, expect, it } from "vitest";

import { getOnboardingState, saveOnboardingState } from "@/lib/onboarding/service";

describe("onboarding service", () => {
  it("lagrer gyldig onboarding payload", () => {
    const record = saveOnboardingState("u1", 3, {
      companyName: "SosialVekst AS",
      fullName: "Kenneth",
      countryCode: "NO",
      targetAudience: "SMB",
      brandVoice: "Profesjonell",
      keyMessages: ["Kvalitet", "Trygghet"],
      logoUrl: "",
      mediaMode: "hybrid",
      channels: ["facebook", "instagram"],
    });

    expect(record.step).toBe(3);
    expect(record.completed).toBe(false);
  });

  it("gir default state for ny bruker", () => {
    const state = getOnboardingState("new-user");
    expect(state.step).toBe(1);
    expect(state.completed).toBe(false);
  });
});

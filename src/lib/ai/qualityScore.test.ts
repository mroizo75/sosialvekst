import { describe, expect, it } from "vitest";

import { defaultBrandRules } from "@/lib/ai/brandRules";
import { validateAiOutput } from "@/lib/ai/outputValidator";
import { calculateQualityScore } from "@/lib/ai/qualityScore";

const readable = "Kveldssolen treffer gatene i Mallorca.\n\nDu kan gå dem uten kart.\n\nHvilken gate ville du tatt?";

describe("calculateQualityScore", () => {
  it("gir ikke fast merketreff, og trekker for tall i inspirasjon", () => {
    const plain = calculateQualityScore({
      text: "Opplev kvelden. Du er klar for en tur.",
      hasForbiddenTerms: false,
    });
    const withProduct = calculateQualityScore({
      text: "Vernerunde tar tjue minutter.\n\nHvilken rute ville du tatt?",
      hasForbiddenTerms: false,
      profileTerms: ["Vernerunde"],
    });
    const missingProduct = calculateQualityScore({
      text: "Vernerunde tar tjue minutter.\n\nHvilken rute ville du tatt?",
      hasForbiddenTerms: false,
      profileTerms: ["HMS-håndbok"],
    });
    const withNumber = calculateQualityScore({
      text: "2 strender ligger nær byen. Du velger selv.\n\nHvilken ville du tatt?",
      hasForbiddenTerms: false,
      pillar: "inspiration",
    });
    const withoutNumber = calculateQualityScore({
      text: "Strendene ligger nær byen. Du velger selv.\n\nHvilken ville du tatt?",
      hasForbiddenTerms: false,
      pillar: "inspiration",
    });

    expect(plain.ctaPresent).toBe(false);
    expect(plain.brandMatch).not.toBe(78);
    expect(plain.engagementPotential).toBeLessThan(withProduct.engagementPotential);
    expect(withProduct.brandMatch).toBeGreaterThan(missingProduct.brandMatch);
    expect(withNumber.factualClarity).toBeLessThan(withoutNumber.factualClarity);
  });

  it("sender kundens forbudte ord til vurdering", () => {
    const result = validateAiOutput({
      text: readable,
      brandRules: { ...defaultBrandRules, prohibitedTerms: ["kveldssolen"] },
    });

    expect(result.approved).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("forbudte"))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { fillIfEmpty, fillListIfEmpty, isProfileSparse } from "@/lib/onboarding/autofill";

describe("autofill av bedriftsprofil", () => {
  it("fyller tomme felt og beholder egen tekst", () => {
    expect(fillIfEmpty("", "Reiseliv")).toBe("Reiseliv");
    expect(fillIfEmpty("Reisebyrå", "Reiseliv")).toBe("Reisebyrå");
    expect(fillListIfEmpty("  ", ["A", "B"], ", ")).toBe("A, B");
    expect(fillListIfEmpty("Egen", ["A"], "\n")).toBe("Egen");
  });

  it("lar tomt felt være tomt når forslaget mangler", () => {
    expect(fillIfEmpty(undefined, undefined)).toBe("");
    expect(fillListIfEmpty("", [], ", ")).toBe("");
  });

  it("regner profilen som tynn når under halvparten av målrettingsfeltene er fylt", () => {
    expect(isProfileSparse({ companyDescription: "Hei", products: ["A"], industry: "" })).toBe(true);
    expect(
      isProfileSparse({
        companyDescription: "Hei",
        industry: "Reiseliv",
        targetAudience: "Familier",
        brandVoice: "Varm",
        products: ["A"],
      }),
    ).toBe(false);
  });
});

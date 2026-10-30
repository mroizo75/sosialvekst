import { describe, expect, it } from "vitest";

import { buildNorwegianCopyPrompt } from "@/lib/ai/copyPromptBuilderNo";
import { linkedInFallbackText } from "@/lib/ai/linkedinCopy";
import { defaultBrandRules } from "@/lib/ai/brandRules";

describe("linkedInFallbackText", () => {
  it("skriver et faginnlegg og ikke forbrukerspørsmålet", () => {
    const text = linkedInFallbackText("Slik ser Digitalt HMS-system ut i praksis", {
      companyName: "HMS Nova",
      industry: "HMS",
    });

    expect(text).toContain("Digitalt HMS-system");
    expect(text).toContain("hos oss i HMS Nova");
    expect(text).toContain("I HMS ser jeg det oftest slik.");
    expect(text.toLowerCase()).not.toContain("hvilken ville du valgt");
    expect(text.toLowerCase()).not.toContain("verdt å se nærmere");
    expect(text).not.toMatch(/ut i praksis/i);
  });

  it("dropper bedriftsnavn når det mangler", () => {
    const text = linkedInFallbackText("Risikovurdering");
    expect(text).toContain("i bedriftene jeg jobber med");
    expect(text).not.toContain("hos oss");
  });
});

describe("LinkedIn-prompt", () => {
  it("ber om jeg-form og forbyr reserveteksten", () => {
    const prompt = buildNorwegianCopyPrompt({
      topic: "Digitalt HMS-system",
      channel: "linkedin",
      brandRules: defaultBrandRules,
      brandContext: { companyName: "HMS Nova" },
      contentPillar: "useful",
      ctaType: "Hvordan løser dere dette i dag?",
    });

    expect(prompt.system).toContain("fagperson");
    expect(prompt.user).toContain("jeg-form");
    expect(prompt.user).toContain("Hvordan løser dere dette i dag?");
    expect(prompt.user.toLowerCase()).toContain("hvilken ville du valgt");
    expect(prompt.user).toContain("IKKE SKRIV");
  });
});

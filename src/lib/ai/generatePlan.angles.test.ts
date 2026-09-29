import { describe, expect, it } from "vitest";

import { buildNorwegianCopyPrompt } from "@/lib/ai/copyPromptBuilderNo";
import { anglesFromProfile, fallbackAngle } from "@/lib/ai/generatePlan";
import { defaultBrandRules } from "@/lib/ai/brandRules";
import { assignPostStrategy } from "@/lib/ai/postStrategy";

describe("planAngles", () => {
  it("gir unik vinkel per innlegg og henter fallback fra produktet", () => {
    expect(fallbackAngle({ products: ["Buketter"] })).toBe("Slik ser Buketter ut i praksis");
    expect(fallbackAngle(undefined)).not.toContain("Generell merkevarebygging");

    const angles = anglesFromProfile("Salg", { products: ["Buketter"], services: ["Levering"] }, 6);
    expect(new Set(angles.map((item) => item.angle)).size).toBe(6);
    expect(angles.some((item) => item.angle.includes("Buketter"))).toBe(true);
    expect(angles.map((item) => item.angle).join(" ")).not.toContain("Generell merkevarebygging");

    const facebook = assignPostStrategy({
      weekIndex: 0,
      dayIndex: 0,
      channel: "facebook",
      postsPerWeek: 3,
    });
    const instagram = assignPostStrategy({
      weekIndex: 0,
      dayIndex: 0,
      channel: "instagram",
      postsPerWeek: 3,
    });
    expect(facebook.contentPillar).not.toBe(instagram.contentPillar);

    const prompt = buildNorwegianCopyPrompt({
      topic: "Buketter",
      channel: "facebook",
      brandRules: defaultBrandRules,
      avoidRepeating: ["Slik ser Buketter ut i praksis", "Åpning en", "Åpning to", "Åpning tre", "Åpning fire", "Åpning fem"],
    });
    expect(prompt.user).toContain("Ikke gjenta disse");
    expect(prompt.user).not.toContain("Slik ser Buketter ut i praksis");
    expect(prompt.user).toContain("Åpning en");
    expect(prompt.user).toContain("Åpning fem");
  });
});

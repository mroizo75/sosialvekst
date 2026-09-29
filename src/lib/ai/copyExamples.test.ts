import { describe, expect, it } from "vitest";

import { COPY_EXAMPLES, formatCopyExamples } from "@/lib/ai/copyExamples";
import type { ContentPillar } from "@/lib/ai/postStrategy";

const pillars: ContentPillar[] = ["inspiration", "useful", "commercial", "trust"];

describe("formatCopyExamples", () => {
  it("sender aldri plassholdere, og velger eksempler etter verden", () => {
    for (const pillar of pillars) {
      const travel = formatCopyExamples(pillar, "travel");
      const other = formatCopyExamples(pillar, "generic");
      expect(travel).not.toContain("[FYLL INN");
      expect(other).not.toContain("[FYLL INN");
      expect(COPY_EXAMPLES[pillar].some((example) => example.world === "other")).toBe(true);
      expect(COPY_EXAMPLES[pillar].some((example) => !example.text.includes("?"))).toBe(true);
    }

    expect(formatCopyExamples("inspiration", "travel")).toContain("Kveldssolen ligger lavt");
    expect(formatCopyExamples("inspiration", "generic")).toContain("Melet er ferdig siktet");
    expect(formatCopyExamples("inspiration", "generic")).not.toContain("Kveldssolen");
    expect(formatCopyExamples("useful", "craft")).toContain("Vernerunden");
  });
});

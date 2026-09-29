import { describe, expect, it } from "vitest";

import { autoFixCopy, findCopyIssues } from "@/lib/ai/validateCopy";

describe("validateCopy", () => {
  it("flytter hashtags til siste linje og fjerner tegnsetting", () => {
    const fixed = autoFixCopy("Se gaten.\n#sicilia. #kveld! #reise #ekstra,");

    expect(fixed.endsWith("\n#sicilia #kveld #reise")).toBe(true);
    expect(fixed).not.toContain("#sicilia.");
    expect(fixed).not.toContain("#ekstra");
  });

  it("avviser åpningsspørsmål og manglende sted", () => {
    const issues = findCopyIssues("Visste du dette? Send dette til en venn.", {
      placeName: "Sicilia",
      pillar: "inspiration",
    });

    expect(issues.some((issue) => issue.includes("spørsmålstegn"))).toBe(true);
    expect(issues.some((issue) => issue.includes("visste du"))).toBe(true);
    expect(issues.some((issue) => issue.includes("send dette til"))).toBe(true);
    expect(issues.some((issue) => issue.includes("Sicilia"))).toBe(true);
  });

  it("avviser hotelltall i inspirasjon, men slipper gjennom en observasjon", () => {
    expect(findCopyIssues("Sicilia har 2 millioner hoteller i 40 land.", {
      placeName: "Sicilia",
      pillar: "inspiration",
    }).some((issue) => issue.includes("hoteller"))).toBe(true);

    expect(findCopyIssues("Kveldssolen treffer gatene i Sicilia.\n\nHvilken gate ville du tatt?\n#sicilia", {
      placeName: "Sicilia",
      pillar: "inspiration",
    })).toEqual([]);
  });
});

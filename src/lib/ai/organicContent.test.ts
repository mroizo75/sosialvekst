import { describe, expect, it } from "vitest";

import { defaultBrandRules } from "@/lib/ai/brandRules";
import { buildNorwegianCopyPrompt } from "@/lib/ai/copyPromptBuilderNo";
import { validateAiOutput } from "@/lib/ai/outputValidator";
import { assignPostStrategy } from "@/lib/ai/postStrategy";
import { runRevisionLoop } from "@/lib/ai/revisionLoop";

describe("organisk innholdsstrategi", () => {
  it("fordeler 20 innlegg som 8 inspirasjon, 5 nyttig, 4 kommersielt og 3 tillit", () => {
    const posts = Array.from({ length: 20 }, (_, feedIndex) =>
      assignPostStrategy({
        weekIndex: 0,
        dayIndex: 0,
        channel: "instagram",
        feedIndex,
      }),
    );

    const count = (pillar: string) => posts.filter((post) => post.contentPillar === pillar).length;
    expect(count("inspiration")).toBe(8);
    expect(count("useful")).toBe(5);
    expect(count("commercial")).toBe(4);
    expect(count("trust")).toBe(3);
  });

  it("gjentar ikke samme bildemotiv to ganger på rad", () => {
    const posts = Array.from({ length: 40 }, (_, feedIndex) =>
      assignPostStrategy({
        weekIndex: 0,
        dayIndex: 0,
        channel: "facebook",
        feedIndex,
      }),
    );

    for (let index = 0; index < posts.length - 1; index += 1) {
      expect(posts[index]?.visualMotif).not.toBe(posts[index + 1]?.visualMotif);
    }
  });

  it("bruker case_study bare når en ekte kundehistorie finnes", () => {
    const withStory = assignPostStrategy({
      weekIndex: 0,
      dayIndex: 0,
      channel: "facebook",
      feedIndex: 6,
      hasCustomerStories: true,
    });
    const withoutStory = assignPostStrategy({
      weekIndex: 0,
      dayIndex: 0,
      channel: "facebook",
      feedIndex: 6,
      hasCustomerStories: false,
    });

    expect(withStory.contentPillar).toBe("trust");
    expect(withStory.format).toBe("case_study");
    expect(withoutStory.format).not.toBe("case_study");
  });

  it("godkjenner tekst uten bedriftsnavn og flagger oppdiktede påstander", () => {
    const approved = validateAiOutput({
      text: "Skal du til Mallorca?\n\nIkke bestill hotell før du vet dette.\n\nHvilken ville du valgt?",
      brandRules: defaultBrandRules,
      companyName: "Sydenklar",
    });
    const rejected = validateAiOutput({
      text: "Vi hjalp nylig en familie som fant best pris hos oss.\n\nHvilken ville du valgt?",
      brandRules: defaultBrandRules,
      companyName: "Sydenklar",
    });

    expect(approved.approved).toBe(true);
    expect(approved.reasons.some((reason) => reason.includes("Bedriftsnavnet"))).toBe(false);
    expect(rejected.approved).toBe(false);
    expect(rejected.reasons.some((reason) => reason.includes("udokumentert"))).toBe(true);
  });

  it("limer ikke inn merkenavn når teksten revideres", () => {
    const result = runRevisionLoop({
      initialText: "Gran Canaria i november er ofte solrikt på sørsiden. Maspalomas er rolig. Puerto Rico er kompakt.",
      companyName: "Sydenklar",
      maxAttempts: 2,
    });

    expect(result.finalText.toLowerCase()).not.toContain("sydenklar");
    expect(result.finalText.toLowerCase()).not.toContain("presenterer");
    expect(result.finalText).toMatch(/hvilken|lagre|send den/i);
  });

  it("ber ikke copy-prompten om å nevne bedriften i hvert innlegg", () => {
    const prompt = buildNorwegianCopyPrompt({
      topic: "Gran Canaria i november",
      channel: "instagram",
      brandRules: defaultBrandRules,
      brandContext: { companyName: "Sydenklar", websiteUrl: "https://sydenklar.no" },
      contentPillar: "inspiration",
      reelScript: true,
    });

    expect(prompt.system).not.toContain("SKAL nevnes minst");
    expect(prompt.system).toContain("Ikke finn på kundehistorier");
    expect(prompt.user).toContain("Hook");
    expect(prompt.user).toContain("Ingen nettadresse");
    expect(prompt.system.toLowerCase()).not.toContain("hotell");
    expect(prompt.system.toLowerCase()).not.toContain("strand");
  });

  it("holder bilderetningen bransjenøytral til reiseverdenen tolker den", () => {
    const posts = Array.from({ length: 20 }, (_, feedIndex) =>
      assignPostStrategy({
        weekIndex: 0,
        dayIndex: 0,
        channel: "facebook",
        feedIndex,
      }),
    );

    for (const post of posts) {
      const direction = post.imageDirection.toLowerCase();
      expect(direction).not.toContain("basseng");
      expect(direction).not.toContain("strand");
      expect(direction).not.toContain("solnedgang");
      expect(direction).not.toContain("hotell");
    }
  });
});

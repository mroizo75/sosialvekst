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

    expect(result.status).toBe("needs_review");
    expect(result.finalText).toBe(
      "Gran Canaria i november er ofte solrikt på sørsiden. Maspalomas er rolig. Puerto Rico er kompakt.",
    );
    expect(result.finalText.toLowerCase()).not.toContain("sydenklar");
    expect(result.finalText.toLowerCase()).not.toMatch(/send den|lagre denne/);
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
    expect(prompt.user).toContain("Bygg gjenkjennelse");
    expect(prompt.user.toLowerCase()).not.toContain("deling");
    expect(prompt.user).toContain("Ingen nettadresse");
    expect(prompt.system).toContain("Ikke åpne med et spørsmål");
    expect(prompt.system).toContain("send dette til");
    expect(prompt.system).toContain("uten tegnsetting");
    expect(prompt.system).toContain("antall hoteller");
    expect(prompt.system.toLowerCase()).not.toContain("strand");

    const tiktok = buildNorwegianCopyPrompt({
      topic: "En uke på Sicilia",
      channel: "tiktok",
      brandRules: defaultBrandRules,
      brandContext: { companyName: "Sydenklar" },
      contentPillar: "inspiration",
    });
    expect(tiktok.system).toContain("Ikke åpne med et spørsmål");
    expect(tiktok.system).toContain("send dette til");
    expect(tiktok.system).toContain("uten tegnsetting");
  });

  it("holder utvalgsfakta unna inspirasjon og nyttig", () => {
    const catalog = "2 millioner hoteller i 90 land";
    const brandContext = {
      companyName: "Sydenklar",
      industry: "Reise",
      targetAudience: "Par som vil ha sol",
      companyDescription: catalog,
    };
    const inspiration = buildNorwegianCopyPrompt({
      topic: "Sicilia",
      channel: "facebook",
      brandRules: defaultBrandRules,
      brandContext,
      contentPillar: "inspiration",
    });
    const commercial = buildNorwegianCopyPrompt({
      topic: "Sicilia",
      channel: "facebook",
      brandRules: defaultBrandRules,
      brandContext,
      contentPillar: "commercial",
    });

    expect(inspiration.system).toContain("Firmanavn: Sydenklar");
    expect(inspiration.system).toContain("Bransje: Reise");
    expect(inspiration.system).toContain("Målgruppe: Par som vil ha sol");
    expect(inspiration.system).toContain("EKSEMPLER PÅ GODE INNLEGG");
    expect(inspiration.system).toContain("Kveldssolen ligger lavt");
    expect(inspiration.system).not.toContain(catalog);
    expect(commercial.system).toContain(catalog);
  });

  it("legger bildet først i copy-prompten når scenen er kjent", () => {
    const prompt = buildNorwegianCopyPrompt({
      topic: "En uke på Sicilia",
      channel: "facebook",
      brandRules: defaultBrandRules,
      brandContext: { companyName: "Sydenklar" },
      contentPillar: "inspiration",
      visual: {
        placeName: "Sicilia",
        scene: "Photograph a recognizable public view of Sicilia. A busy street",
        overlayTitle: "Sicilia",
        overlaySubline: "Gater i kveldssol",
      },
    });

    expect(prompt.user.startsWith("BILDE OG OVERLAY")).toBe(true);
    expect(prompt.user).toContain("Sted: Sicilia");
    expect(prompt.user.indexOf("BILDE OG OVERLAY")).toBeLessThan(prompt.user.indexOf("Tema:"));
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

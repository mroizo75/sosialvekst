import { describe, expect, it } from "vitest";

import { buildBoardPrompt, buildSlidePrompt, parseSocialDesign, resolveDesignMode } from "@/lib/ai/slideDesign";
import type { VisualBrief } from "@/lib/ai/visualDirection";

const brief: VisualBrief = {
  world: "travel",
  placeName: "Gran Canaria",
  sceneLock: "Gran Canaria",
  subjectDirection: "Mennesker på ferie.",
  carouselAngles: [],
  bans: [],
};

const guide = {
  mode: "guide" as const,
  coverTitle: "GRAN CANARIA",
  coverSubline: "Her bør du bo",
  question: "Hvor bør du bo på Gran Canaria?",
  cta: "Se hotellene",
  cards: [
    {
      title: "Maspalomas",
      summary: "Roligere, flotte strender og bra for par.",
      bullets: ["Lange strender", "Familievennlig", "Rolig atmosfære"],
    },
    {
      title: "Puerto Rico",
      summary: "Mye sol og kort vei til restauranter.",
      bullets: ["Solrikt", "Mange restauranter", "Alt i nærheten"],
    },
    {
      title: "Playa del Inglés",
      summary: "Mer liv, shopping og uteliv.",
      bullets: ["Liv og stemning", "Shopping", "Uteliv"],
    },
  ],
};

describe("slideDesign", () => {
  it("lager guide for nyttig innhold og cover for inspirasjon", () => {
    expect(resolveDesignMode("useful", "people")).toBe("guide");
    expect(resolveDesignMode("inspiration", "people")).toBe("headline");
    expect(resolveDesignMode("inspiration", "comparison")).toBe("guide");
  });

  it("ber bildet rendre den eksakte teksten, ikke et nakent foto", () => {
    const cover = buildSlidePrompt(guide, brief, 0);
    const point = buildSlidePrompt(guide, brief, 1);
    const board = buildBoardPrompt(guide, brief);

    expect(cover).toContain("GRAN CANARIA");
    expect(cover).toContain("Her bør du bo");
    expect(cover).toContain("finished social media graphic");
    expect(cover.toLowerCase()).not.toContain("ingen tekst");
    expect(point).toContain("Maspalomas");
    expect(point).toContain("2/4");
    expect(board).toContain("Hvor bør du bo på Gran Canaria?");
    expect(board).toContain("Playa del Inglés");
    expect(board).toContain("16:9");
  });

  it("avviser en guide uten tre ekte kort", () => {
    const parsed = parseSocialDesign(
      JSON.stringify({
        coverTitle: "Vernerunde",
        coverSubline: "Dette bør du vite",
        question: "Hvor starter du?",
        cta: "Se hvordan",
        cards: [],
      }),
      "guide",
    );

    expect(parsed).toBeNull();
  });
});
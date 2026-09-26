import { describe, expect, it } from "vitest";

import sharp from "sharp";

import { buildSlideSvg, composeDesignedSlide, resolveSlideLayout } from "@/lib/ai/slideComposer";
import { buildPhotoPrompt, composeGuideCaption, headlineFromCaption, parseSocialDesign, resolveDesignMode } from "@/lib/ai/slideDesign";
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

  it("lar fotoet være ekte og setter teksten i layouten", () => {
    const photo = buildPhotoPrompt(guide, brief, 1);
    const svg = buildSlideSvg({
      photo: Buffer.alloc(0),
      design: guide,
      slideIndex: 1,
      layout: "card",
      primaryColor: "#0E4D6C",
    });

    expect(photo).toContain("Maspalomas");
    expect(photo.toLowerCase()).toContain("no text");
    expect(svg).toContain("Maspalomas");
    expect(svg).toContain("Lange strender");
    expect(svg).toContain("#0E4D6C");
  });

  it("komponerer et ferdig slide med ekte tekstlag", async () => {
    const photo = await sharp({
      create: { width: 640, height: 800, channels: 3, background: "#336699" },
    }).jpeg().toBuffer();
    const slide = await composeDesignedSlide({
      photo,
      design: guide,
      slideIndex: 0,
      layout: "cover",
      primaryColor: "#0E4D6C",
    });

    expect(slide.length).toBeGreaterThan(1000);
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

  it("bruker innleggets egen hook på enkeltposter", () => {
    const lines = headlineFromCaption(
      "Tre steder som føles helt forskjellige.\nMaspalomas er roligere for par.\n\nhttps://sydenklar.no",
    );
    const svg = buildSlideSvg({
      photo: Buffer.alloc(0),
      design: {
        mode: "headline",
        coverTitle: lines.coverTitle,
        coverSubline: lines.coverSubline,
        question: lines.coverTitle,
        cards: [],
        cta: "",
      },
      slideIndex: 0,
      layout: "single",
      primaryColor: "#0E4D6C",
    });
    const photo = buildPhotoPrompt(
      {
        mode: "headline",
        coverTitle: lines.coverTitle,
        coverSubline: lines.coverSubline,
        question: lines.coverTitle,
        cards: [],
        cta: "",
      },
      brief,
      0,
      "single",
    );

    expect(lines.coverTitle).toBe("Tre steder som føles helt forskjellige.");
    expect(lines.coverSubline).toContain("Maspalomas");
    expect(lines.coverTitle).not.toContain("http");
    expect(svg).toContain("Tre steder som føles");
    expect(svg).toContain("#0E4D6C");
    expect(svg).not.toContain("fade");
    expect(photo.toLowerCase()).toContain("upper half");
    expect(photo.toLowerCase()).toContain("no text");
    expect(resolveSlideLayout("facebook", "headline", 0)).toBe("single");
    expect(resolveSlideLayout("linkedin", "guide", 0)).toBe("board");
    expect(resolveSlideLayout("instagram", "guide", 0)).toBe("cover");
    expect(resolveSlideLayout("instagram", "guide", 1)).toBe("card");
  });

  it("dropper lenke når innlegget ikke har en setning", () => {
    const lines = headlineFromCaption("https://sydenklar.no");

    expect(lines.coverTitle).toBe("Se dette");
    expect(lines.coverSubline).not.toContain("http");
  });

  it("skriver karusellteksten fra kortene, ikke som en annonse", () => {
    const caption = composeGuideCaption(guide, "https://sydenklar.no");

    expect(caption.startsWith("Hvor bør du bo på Gran Canaria?")).toBe(true);
    expect(caption).toContain("Maspalomas\nRoligere, flotte strender og bra for par.");
    expect(caption).toContain("Puerto Rico");
    expect(caption).toContain("Playa del Inglés");
    expect(caption).not.toContain("omfattende");
    expect(caption.endsWith("https://sydenklar.no")).toBe(true);
  });
});
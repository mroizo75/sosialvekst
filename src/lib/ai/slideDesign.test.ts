import { describe, expect, it } from "vitest";

import sharp from "sharp";

import { buildSlideSvg, composeDesignedSlide, photoTextColors, resolveSlideLayout } from "@/lib/ai/slideComposer";
import { buildPhotoPrompt, buildPhotoSubject, composeGuideCaption, fallbackSocialDesign, headlineFromCaption, knownPlaceLook, parseSocialDesign, placeGuideCopy, resolveDesignMode } from "@/lib/ai/slideDesign";
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

  it("bruker samme scene i fotoprompten som copy-prompten kan få", () => {
    const subject = buildPhotoSubject(guide, brief, 0);
    const photo = buildPhotoPrompt(guide, brief, 0);

    expect(subject).toContain("Gran Canaria");
    expect(photo).toContain(subject);
  });

  it("legger reisetekst på bildet, ikke på et fargefelt", () => {
    const svg = buildSlideSvg({
      photo: Buffer.alloc(0),
      design: guide,
      slideIndex: 1,
      layout: "photo",
      primaryColor: "#0E4D6C",
      accentColor: "#F6E27A",
    });

    expect(svg).toContain("Maspalomas");
    expect(svg).toContain("fade");
    expect(svg).toContain("#F6E27A");
    expect(svg).not.toContain("Lange strender");
  });

  it("bruker bedriftens egen aksent, ikke Sydenklar-gul", () => {
    const sydenklar = photoTextColors({ primary: "#0E4D6C", accent: "#F6E27A" });
    const other = photoTextColors({ primary: "#1F3A2E", accent: "#E07A3D" });

    expect(sydenklar).toEqual({ title: "#FFFFFF", accent: "#F6E27A" });
    expect(other.title).toBe("#FFFFFF");
    expect(other.accent).not.toBe("#F6E27A");
    expect(other.accent).toBe("#E07A3D");
  });

  it("komponerer et ferdig slide med ekte tekstlag", async () => {
    const photo = await sharp({
      create: { width: 640, height: 800, channels: 3, background: "#336699" },
    }).jpeg().toBuffer();
    const slide = await composeDesignedSlide({
      photo,
      design: guide,
      slideIndex: 0,
      layout: "single",
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
    expect(resolveSlideLayout("facebook", "headline", 0, true)).toBe("photo");
    expect(resolveSlideLayout("instagram", "guide", 1, true)).toBe("photo");
    expect(resolveSlideLayout("facebook", "headline", 0)).toBe("single");
    expect(resolveSlideLayout("instagram", "guide", 1)).toBe("card");
  });

  it("ber om stedet, ikke et oppdiktet hotell", () => {
    const photo = buildPhotoPrompt(
      {
        mode: "guide",
        coverTitle: "DUBROVNIK",
        coverSubline: "Her bør du bo",
        question: "Hvor vil du bo i Dubrovnik?",
        cta: "Se utvalget",
        cards: [
          {
            title: "Gamlebyen",
            summary: "Bo midt i historien",
            bullets: ["Byporten", "Steingater", "Utsikt"],
          },
        ],
      },
      { ...brief, placeName: "Dubrovnik", sceneLock: "Dubrovnik" },
      1,
    );

    expect(photo).toContain("Gamlebyen");
    expect(photo).toContain("Dubrovnik");
    expect(photo).toContain("orange clay roof tiles");
    expect(photo.toLowerCase()).toContain("do not invent a hotel");
    expect(photo.toLowerCase()).toContain("no text");
  });

  it("lar karusellforsiden være stedet, ikke en hotellannonse", () => {
    const copy = placeGuideCopy(
      {
        mode: "guide",
        coverTitle: "Hotell i Dubrovnik",
        coverSubline: "Sammenlign priser og bestill",
        question: "Hvor vil du bo i Dubrovnik?",
        cta: "Sammenlign priser",
        cards: guide.cards,
      },
      "Dubrovnik",
    );

    expect(copy.coverTitle).toBe("Dubrovnik");
    expect(copy.coverSubline).toBe("Hvor vil du bo i Dubrovnik?");
    expect(copy.cta).toBe("Hvilken ville du valgt?");
    expect(copy.coverTitle.toLowerCase()).not.toContain("hotell");
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

  it("fjerner salgsord fra fallback-tittelen", () => {
    const design = fallbackSocialDesign({
      topic: "Sicilia hotell pris",
      channel: "facebook",
      brief: { ...brief, placeName: null },
    });
    const empty = fallbackSocialDesign({
      topic: "hotell booking",
      channel: "facebook",
      brief: { ...brief, placeName: null },
    });

    expect(design.coverTitle).toBe("SICILIA");
    expect(design.coverTitle).not.toMatch(/HOTELL|PRIS|BESTILL|BOOKING/);
    expect(empty.coverTitle).toBe("VERDT EN TUR");
  });

  it("bruker kjent stedsutseende og lar ukjente steder være tomme", () => {
    expect(knownPlaceLook("Dubrovnik")).toContain("limestone");
    expect(knownPlaceLook("Sicilia")).toBeNull();
    expect(buildPhotoPrompt(guide, brief, 0, "slide", "stone lanes and the sea")).toContain("stone lanes and the sea");
  });

  it("rendrer æ, ø og å i overlayet", async () => {
    const photo = await sharp({
      create: { width: 64, height: 64, channels: 3, background: "#123456" },
    }).jpeg().toBuffer();
    const design = {
      mode: "headline" as const,
      coverTitle: "Søk. Sammenlign. Æøå",
      coverSubline: "Æøå",
      question: "Æøå",
      cards: [],
      cta: "",
    };
    const svg = buildSlideSvg({ photo, design, slideIndex: 0, layout: "photo" });
    const rendered = await composeDesignedSlide({ photo, design, slideIndex: 0, layout: "photo" });

    expect(svg).toContain("Søk");
    expect(svg).toContain("Sammenlign");
    expect(svg).toContain("Æøå");
    expect(svg).toContain("Segoe UI");
    expect(rendered.length).toBeGreaterThan(0);
  });
});
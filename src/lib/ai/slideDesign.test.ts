import { describe, expect, it } from "vitest";

import sharp from "sharp";

import {
  composeDesignedSlide,
  contrastPlateFill,
  photoTextColors,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  SQUARE_SLIDE_HEIGHT,
} from "@/lib/ai/slideComposer";
import {
  buildPhotoPrompt,
  buildPhotoSubject,
  composeGuideCaption,
  designLengthIssues,
  designUserPrompt,
  fallbackSocialDesign,
  fitDesignToLimits,
  knownPlaceLook,
  parseSocialDesign,
  placeGuideCopy,
  resolveDesignMode,
  sentencesWithin,
  type SocialDesign,
} from "@/lib/ai/slideDesign";
import type { VisualBrief } from "@/lib/ai/visualDirection";

const travelBrief: VisualBrief = {
  world: "travel",
  placeName: "Gran Canaria",
  sceneLock: "Gran Canaria",
  subjectDirection: "Mennesker på ferie.",
  carouselAngles: [],
  bans: [],
};

const craftBrief: VisualBrief = {
  world: "craft",
  placeName: null,
  sceneLock: "Rørleggerfirma",
  subjectDirection: "Vis faget i praksis.",
  carouselAngles: [],
  bans: [],
};

const plumbing: SocialDesign = {
  mode: "guide",
  hook: "Et lite drypp kan bli en stor regning.",
  coverKicker: "Våtrom",
  coverTitle: "3 tegn på at røret lekker",
  coverSubline: "Sjekk dette før skaden sprer seg i veggen.",
  coverPhotoSubject: "A plumber kneeling by a bathroom floor drain, checking tiles with a flashlight",
  question: "Hva sjekker du først?",
  cta: "Hvilket tegn har du sett hjemme?",
  cards: [
    {
      title: "Mørke flekker",
      summary: "Misfarging rundt sluk og fuger betyr ofte fukt bak flisene.",
      photoSubject: "Close-up of darkened grout around a shower drain",
    },
    {
      title: "Lukt av mugg",
      summary: "En jordaktig lukt kommer ofte før du ser skaden.",
      photoSubject: "A homeowner opening a bathroom cabinet under the sink",
    },
    {
      title: "Høy vannmåler",
      summary: "Steng alle kraner. Går måleren likevel, lekker det et sted.",
      photoSubject: "Hands reading a water meter in a basement",
    },
  ],
};

const solidPhoto = (color: string, width = 640, height = 960): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer();

describe("slideDesign", () => {
  it("lager karusell for Facebook og Instagram, enkeltbilde ellers", () => {
    expect(resolveDesignMode("instagram")).toBe("guide");
    expect(resolveDesignMode("facebook")).toBe("guide");
    expect(resolveDesignMode("linkedin")).toBe("headline");
    expect(resolveDesignMode("tiktok")).toBe("headline");
  });

  it("beholder hele setninger fra modellen og krever tre kort i en karusell", () => {
    const parsed = parseSocialDesign(JSON.stringify(plumbing), "guide");
    const missingCards = parseSocialDesign(JSON.stringify({ ...plumbing, cards: [] }), "guide");

    expect(parsed?.coverTitle).toBe("3 tegn på at røret lekker");
    expect(parsed?.coverSubline).toBe("Sjekk dette før skaden sprer seg i veggen.");
    expect(parsed?.cards).toHaveLength(3);
    expect(parsed?.cards[2]?.summary).toBe("Steng alle kraner. Går måleren likevel, lekker det et sted.");
    expect(missingCards).toBeNull();
  });

  it("avviser for lang tekst og korter bare ned til hele setninger", () => {
    const long: SocialDesign = {
      ...plumbing,
      coverTitle: "Dette er en altfor lang forsidetittel som ingen leser",
      cards: [{
        ...plumbing.cards[0]!,
        summary: "Første setning er kort. Andre setning er mye lengre og tar med alt for mange ord om fukt, fuger, sluk, membran, rør og fliser på det gamle badet.",
      }],
    };

    expect(designLengthIssues(long)).toEqual(expect.arrayContaining([
      expect.stringContaining("coverTitle"),
      expect.stringContaining("cards[0].summary"),
    ]));
    expect(fitDesignToLimits(long).cards[0]?.summary).toBe("Første setning er kort.");
    expect(sentencesWithin("Én lang setning uten punktum som fortsetter", 3)).toBe("Én lang setning uten punktum som fortsetter");
  });

  it("ber om bransjens eget miljø, ikke et feriested", () => {
    const prompt = buildPhotoPrompt(plumbing, craftBrief, 1, null, "Rørlegger");
    const user = designUserPrompt({ topic: "Lekkasje på bad", channel: "instagram", brief: craftBrief }, "guide", []);

    expect(prompt).toContain("darkened grout around a shower drain");
    expect(prompt).toContain("Industry: Rørlegger");
    expect(prompt).toContain("job site or workshop");
    expect(prompt).not.toContain("coast");
    expect(prompt.toLowerCase()).toContain("no text");
    expect(user).toContain("Ikke finn på et feriested");
    expect(user).toContain("Modus: guide");
  });

  it("låser reisebilder til stedet og kjent utseende", () => {
    const design = { ...plumbing, coverPhotoSubject: "", cards: [] };
    const prompt = buildPhotoPrompt(design, { ...travelBrief, placeName: "Dubrovnik" }, 0);
    const user = designUserPrompt({ topic: "Høstferie", channel: "facebook", brief: travelBrief }, "guide", ["For lang tittel."]);

    expect(prompt).toContain("Location: Dubrovnik");
    expect(prompt).toContain("orange clay roof tiles");
    expect(prompt).toContain("Do not invent a hotel");
    expect(buildPhotoSubject(design, travelBrief, 0)).toContain("Gran Canaria");
    expect(user).toContain("Sted: Gran Canaria");
    expect(user).toContain("Forrige utkast ble avvist fordi: For lang tittel.");
    expect(knownPlaceLook("Sicilia")).toBeNull();
  });

  it("lager et anonymt feriemotiv når reisetemaet mangler sted", () => {
    const prompt = buildPhotoPrompt(plumbing, { ...travelBrief, placeName: null }, 0);

    expect(prompt).toContain("unnamed sunny holiday scene");
    expect(prompt).toContain("No recognizable landmark");
    expect(prompt).not.toContain("Scandinavian");
    expect(prompt).not.toContain("Location:");
  });

  it("beholder en slagkraftig reisetittel, men fjerner salg", () => {
    const punchy = placeGuideCopy({ ...plumbing, coverTitle: "Gran Canaria på tre måter" }, "Gran Canaria");
    const sales = placeGuideCopy({ ...plumbing, coverTitle: "Hotell på Gran Canaria", cta: "Bestill nå" }, "Gran Canaria");

    expect(punchy.coverTitle).toBe("Gran Canaria på tre måter");
    expect(sales.coverTitle).toBe("Gran Canaria");
    expect(sales.cta).toBe("Hvilken ville du valgt?");
  });

  it("lager reservetekst fra kortene uten salgsord", () => {
    const caption = composeGuideCaption(plumbing);
    const fallback = fallbackSocialDesign({ topic: "Sicilia hotell pris", channel: "facebook", brief: { ...travelBrief, placeName: null } });

    expect(caption.startsWith("Et lite drypp kan bli en stor regning.")).toBe(true);
    expect(caption).toContain("Mørke flekker");
    expect(caption).toContain("Hvilket tegn har du sett hjemme?");
    expect(fallback.coverTitle).toBe("Sicilia");
  });
});

describe("slideComposer", () => {
  it("rendrer forside, bildeslide, fargekort og avslutning i 4:5", async () => {
    const photo = await solidPhoto("#335577");
    const common = { design: plumbing, carousel: true, primaryColor: "#0E4D6C", accentColor: "#F2C94C", websiteUrl: "https://www.rorfiks.no/" };
    const slides = await Promise.all([
      composeDesignedSlide({ ...common, photo, slideIndex: 0, layout: "cover", credit: "Foto: Ada, CC BY 2.0" }),
      composeDesignedSlide({ ...common, photo, slideIndex: 1, layout: "slide" }),
      composeDesignedSlide({ ...common, slideIndex: 2, layout: "card" }),
      composeDesignedSlide({ ...common, slideIndex: 4, layout: "cta" }),
    ]);
    const sizes = await Promise.all(slides.map((slide) => sharp(slide).metadata()));

    for (const size of sizes) {
      expect(size.width).toBe(SLIDE_WIDTH);
      expect(size.height).toBe(SLIDE_HEIGHT);
    }
  });

  it("rendrer kvadratiske slides for Instagram slik at API-et ikke beskjærer dem", async () => {
    const photo = await solidPhoto("#335577");
    const common = { design: plumbing, carousel: true, shape: "square" as const, primaryColor: "#0E4D6C" };
    const slides = await Promise.all([
      composeDesignedSlide({ ...common, photo, slideIndex: 0, layout: "cover" }),
      composeDesignedSlide({ ...common, slideIndex: 2, layout: "card" }),
      composeDesignedSlide({ ...common, slideIndex: 4, layout: "cta" }),
    ]);
    const sizes = await Promise.all(slides.map((slide) => sharp(slide).metadata()));

    for (const size of sizes) {
      expect(size.width).toBe(SLIDE_WIDTH);
      expect(size.height).toBe(SQUARE_SLIDE_HEIGHT);
    }
  });

  it("viser bare kicker og tittel på forsiden, ikke undertekst", async () => {
    const photo = await solidPhoto("#335577");
    const render = (coverSubline: string) =>
      composeDesignedSlide({ photo, design: { ...plumbing, coverSubline }, slideIndex: 0, layout: "cover" });
    const [short, long] = await Promise.all([render("Kort."), render("En helt annen og mye lengre undertekst her.")]);

    expect(short.equals(long)).toBe(true);
  });

  it("beholder forklaringen på bildeslides etter forsiden", async () => {
    const photo = await solidPhoto("#335577");
    const card = plumbing.cards[0];
    const render = (summary: string) => composeDesignedSlide({
      photo,
      design: { ...plumbing, cards: [{ ...card, summary }, ...plumbing.cards.slice(1)] },
      slideIndex: 1,
      layout: "slide",
    });
    const [a, b] = await Promise.all([render("Kort forklaring."), render("En helt annen forklaring på slide en.")]);

    expect(a.equals(b)).toBe(false);
  });

  it("legger logoen oppe til venstre på forsiden", async () => {
    const photo = await solidPhoto("#224466", 200, 200);
    const logo = await sharp({
      create: { width: 48, height: 48, channels: 4, background: { r: 220, g: 20, b: 20, alpha: 1 } },
    }).png().toBuffer();
    const rendered = await composeDesignedSlide({ photo, design: plumbing, slideIndex: 0, layout: "cover", logo });
    const pixel = await sharp(rendered).extract({ left: 110, top: 110, width: 1, height: 1 }).raw().toBuffer();

    expect(pixel[0]).toBeGreaterThan(180);
    expect(pixel[1]).toBeLessThan(80);
  });

  it("bruker bedriftens egen aksent", () => {
    expect(photoTextColors({ primary: "#0E4D6C", accent: "#F6E27A" })).toEqual({ title: "#FFFFFF", accent: "#F6E27A" });
    expect(photoTextColors({ primary: "#1F3A2E", accent: "#E07A3D" }).accent).toBe("#E07A3D");
  });

  it("legger mørk plate bak lys logo og lys plate bak mørk logo", async () => {
    const white = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const red = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#cc1414" } }).png().toBuffer();

    expect(await contrastPlateFill(white)).toContain("20,24,28");
    expect(await contrastPlateFill(red)).toContain("255,255,255");
  });
});

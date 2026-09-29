import { describe, expect, it } from "vitest";

import {
  buildCarouselVariantPrompt,
  buildVisualBrief,
  detectVisualWorld,
  extractDestination,
} from "@/lib/ai/visualDirection";
import type { BrandContext } from "@/lib/types";

const travelBrand: BrandContext = {
  companyName: "Sydenklar",
  industry: "Reise og ferie",
  companyDescription: "Pakketurer og hotell i Syden",
  products: ["Hotell på Rhodos", "All inclusive Gran Canaria"],
  websiteUrl: "https://sydenklar.no",
};

const hmsBrand: BrandContext = {
  companyName: "HMS Nova",
  industry: "HMS og opplæring",
  companyDescription: "HMS-system og kurs for norske bedrifter",
  products: ["HMS-håndbok", "Vernerunde"],
};

describe("visualDirection", () => {
  it("låser reisebrand til navngitt destinasjon og forbyr kontor-laptop", () => {
    const brief = buildVisualBrief({
      topic: "Sommertilbud på Rhodos",
      brandContext: travelBrand,
    });

    expect(detectVisualWorld(travelBrand, "Sommertilbud på Rhodos")).toBe("travel");
    expect(extractDestination(travelBrand, "Sommertilbud på Rhodos")).toBe("Rhodos");
    expect(brief.placeName).toBe("Rhodos");
    expect(brief.sceneLock).toContain("Rhodos");
    expect(brief.subjectDirection.toLowerCase()).toContain("mennesker");
    expect(brief.subjectDirection.toLowerCase()).not.toContain("i det fjerne");
    expect(brief.carouselAngles.every((angle) => angle.includes("Rhodos"))).toBe(true);
    expect(brief.bans.some((ban) => ban.includes("laptop"))).toBe(true);

    const slide = buildCarouselVariantPrompt("base", brief, 1);
    expect(slide).toContain("SAMME sted");
    expect(slide).toContain("Rhodos");
  });

  it("velger samme destinasjon for karusell når temaet er generisk ferie", () => {
    const briefA = buildVisualBrief({ topic: "Book ferie nå", brandContext: travelBrand });
    const briefB = buildVisualBrief({ topic: "Book ferie nå", brandContext: travelBrand });

    expect(briefA.world).toBe("travel");
    expect(briefA.placeName).toBeTruthy();
    expect(briefA.placeName).toBe(briefB.placeName);
    expect(briefA.carouselAngles[0]).toContain(briefA.placeName ?? "");
  });

  it("unngår reiseverden for HMS-bedrift og beholder laptop-forbud", () => {
    const brief = buildVisualBrief({
      topic: "Slik gjennomfører du vernerunde",
      brandContext: hmsBrand,
      motif: "beach",
    });

    expect(brief.world).not.toBe("travel");
    expect(brief.subjectDirection.toLowerCase()).not.toContain("laptop");
    expect(brief.bans.some((ban) => ban.includes("datamaskin"))).toBe(true);
    expect(brief.sceneLock).toContain("HMS Nova");
    expect(brief.subjectDirection.toLowerCase()).not.toContain("strand");
    expect(brief.subjectDirection.toLowerCase()).not.toContain("basseng");
    expect(brief.subjectDirection.toLowerCase()).not.toContain("ferie");
  });

  it("gjetter ikke et reisemål når profilen ikke nevner destinasjoner", () => {
    const unnamed: BrandContext = {
      companyName: "Sydenklar",
      industry: "Reise og ferie",
      companyDescription: "Hotell og ferie",
    };
    const brief = buildVisualBrief({
      topic: "Varm ferie",
      brandContext: unnamed,
      feedIndex: 1,
      motif: "restaurant",
    });

    expect(brief.world).toBe("travel");
    expect(brief.placeName).toBeNull();
    expect(brief.subjectDirection.toLowerCase()).toContain("restaurant");
    expect(brief.subjectDirection).not.toMatch(/Rhodos|Mallorca|Sicilia/);
  });

  it("leser bransjeord som hele ord, og ignorerer booking i nettstedstekst", () => {
    expect(detectVisualWorld({
      companyName: "SosialVekst",
      industry: "Markedsføring",
      companyDescription: "Automatisk publisering av innlegg",
    }, "automatisk publisering")).not.toBe("food");

    expect(detectVisualWorld({
      companyName: "Klipp og krøll",
      industry: "Frisør",
      companyDescription: "Klipp, farge og styling",
      services: ["Klipp", "Farge"],
      websiteContent: "Enkel booking på nett. Hotellet i nabolaget booker også.",
    }, "Ny frisyre")).not.toBe("travel");

    expect(detectVisualWorld({
      industry: "Reise",
      industryType: "generic",
    })).toBe("generic");
  });

  it("kjenner Kos og Hurghada uten å treffe inni andre ord", () => {
    expect(extractDestination(travelBrand, "Downtown Hurghada")).toBe("Hurghada");
    expect(extractDestination(travelBrand, "En uke på Kos")).toBe("Kos");
    expect(extractDestination({ companyName: "Test" }, "Dette koster for mye")).toBeNull();
  });
});

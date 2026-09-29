import { describe, expect, it } from "vitest";

import { assembleCaption } from "@/lib/ai/generatePost";
import { buildPlaceQuery, formatPhotoCredits, placeSearchQueries, rankPlacePhotos } from "@/lib/ai/placePhoto";

const payload = {
  results: [
    {
      title: "Hotel Bellevue Dubrovnik",
      url: "https://example.com/hotel.jpg",
      creator: "Ada",
      license: "by",
      license_version: "2.0",
      width: 2000,
      height: 1500,
      mature: false,
      tags: [{ name: "dubrovnik" }, { name: "hotel" }],
    },
    {
      title: "Dubrovnik Old Town",
      url: "https://example.com/town.jpg",
      creator: "Michael Cavén",
      license: "by",
      license_version: "2.0",
      width: 1600,
      height: 1000,
      mature: false,
      tags: [{ name: "dubrovnik" }, { name: "oldtown" }],
    },
    {
      title: "Tiny Dubrovnik",
      url: "https://example.com/tiny.jpg",
      creator: "Bo",
      license: "by",
      license_version: "2.0",
      width: 400,
      height: 300,
      mature: false,
      tags: [{ name: "dubrovnik" }],
    },
  ],
};

describe("placePhoto", () => {
  it("søker på stedet og det norske områdenavnet", () => {
    expect(buildPlaceQuery("Dubrovnik", "Gamlebyen")).toBe("Dubrovnik old town");
    expect(buildPlaceQuery("Dubrovnik", "Lapad")).toBe("Dubrovnik Lapad");
    expect(buildPlaceQuery("Rhodos")).toBe("Rhodes Greece cityscape");
    expect(buildPlaceQuery("Korfu", "Korfu by")).toBe("Corfu Greece old town");
    expect(buildPlaceQuery("Kos", "Kardamena")).toBe("Kos Greece Kardamena");
    expect(placeSearchQueries("Hurghada", "Downtown Hurghada")).toEqual([]);
    expect(placeSearchQueries("Dubrovnik", "Lapad").some((item) => item.query.includes("cityscape"))).toBe(false);
  });

  it("velger et ekte bybilde og hopper over hotell og for små filer", () => {
    const photos = rankPlacePhotos(payload, "Dubrovnik", "Gamlebyen");

    expect(photos).toHaveLength(1);
    expect(photos[0]?.imageUrl).toBe("https://example.com/town.jpg");
    expect(photos[0]?.credit).toBe("Foto: Michael Cavén, CC BY 2.0");

    const caption = assembleCaption({
      body: "Kvelden ligger over gaten\n#gouvia #kveld",
      link: "https://www.sydenklar.no/",
      credits: photos[0]?.credit,
    });
    expect(caption.indexOf("#gouvia")).toBeLessThan(caption.indexOf("Foto:"));
    expect(caption.endsWith("Foto: Michael Cavén, CC BY 2.0")).toBe(true);
  });

  it("hopper over avkuttede fotografnavn og samler kreditering på én linje", () => {
    const photos = rankPlacePhotos({
      results: [
        {
          title: "Dubrovnik walls",
          url: "https://example.com/cut.jpg",
          creator: "Michael Cav...",
          license: "by",
          license_version: "2.0",
          width: 1600,
          height: 1000,
          mature: false,
          tags: [{ name: "dubrovnik" }],
        },
        {
          title: "Dubrovnik harbour",
          url: "https://example.com/harbour.jpg",
          creator: "Ada",
          license: "by",
          license_version: "3.0",
          width: 1600,
          height: 1000,
          mature: false,
          tags: [{ name: "dubrovnik" }],
        },
      ],
    }, "Dubrovnik");

    expect(photos).toHaveLength(1);
    expect(photos[0]?.attribution.creator).toBe("Ada");
    expect(formatPhotoCredits([
      { creator: "Ada", license: "CC BY 2.0" },
      { creator: "Bo", license: "CC BY 2.0" },
    ])).toBe("Foto: Ada, Bo – CC BY 2.0");
    expect(formatPhotoCredits([
      { creator: "Ada", license: "CC BY 2.0" },
      { creator: "Bo", license: "CC BY 3.0" },
    ])).toBe("Foto: Ada (CC BY 2.0), Bo (CC BY 3.0)");
  });

  it("tar det første relevante bildet, ikke det største", () => {
    const photos = rankPlacePhotos({
      results: [
        {
          title: "Lapad beach",
          url: "https://example.com/beach.jpg",
          creator: "A",
          license: "by",
          license_version: "2.0",
          width: 1024,
          height: 683,
          mature: false,
          tags: [{ name: "dubrovnik" }, { name: "lapad" }],
        },
        {
          title: "Dubrovnik Tram Veza-Lapad",
          url: "https://example.com/tram.jpg",
          creator: "B",
          license: "by",
          license_version: "2.0",
          width: 3000,
          height: 2000,
          mature: false,
          tags: [{ name: "dubrovnik" }, { name: "lapad" }],
        },
      ],
    }, "Dubrovnik", "Lapad");

    expect(photos.map((photo) => photo.imageUrl)).toEqual(["https://example.com/beach.jpg"]);
  });

  it("returnerer ingenting når området ikke finnes i treffene", () => {
    expect(rankPlacePhotos(payload, "Dubrovnik", "Lapad")).toEqual([]);
  });
});

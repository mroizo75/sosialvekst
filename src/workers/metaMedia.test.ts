import { describe, expect, it } from "vitest";

import { attachedMediaFields, collectImageUrls } from "@/workers/metaMedia";

describe("collectImageUrls", () => {
  it("setter forsiden først og beholder rekkefølgen på slidene", () => {
    expect(collectImageUrls("https://x/0.jpg", ["https://x/1.jpg", "https://x/2.jpg"]))
      .toEqual(["https://x/0.jpg", "https://x/1.jpg", "https://x/2.jpg"]);
  });

  it("fjerner tomme og doble URL-er og kutter ved Metas grense", () => {
    const extras = ["", "https://x/0.jpg", ...Array.from({ length: 12 }, (_, i) => `https://x/e${i}.jpg`)];
    const urls = collectImageUrls("https://x/0.jpg", extras);
    expect(urls).toHaveLength(10);
    expect(urls[0]).toBe("https://x/0.jpg");
    expect(new Set(urls).size).toBe(10);
  });

  it("returnerer tom liste uten bilder", () => {
    expect(collectImageUrls(null, [])).toEqual([]);
  });
});

describe("attachedMediaFields", () => {
  it("lager ett attached_media-felt per bilde i rekkefølge", () => {
    expect(attachedMediaFields(["11", "22"])).toEqual({
      "attached_media[0]": "{\"media_fbid\":\"11\"}",
      "attached_media[1]": "{\"media_fbid\":\"22\"}",
    });
  });
});

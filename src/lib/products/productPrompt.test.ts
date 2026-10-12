import { describe, expect, it } from "vitest";

import { productCopyLines, productSceneDirection, productTopic } from "@/lib/products/productPrompt";
import { productInputSchema } from "@/lib/products/validation";
import type { Product } from "@/lib/types";

const reflexHat: Product = {
  id: "8b0c6c55-6a52-4c1e-9d7e-3f0f3c1f8e11",
  name: "Nordlys reflekslue",
  description: "Strikket ullue med refleksgarn.",
  usageSettings: "Kveldstur med hunden, skoleveien i mørket",
  targetAudience: "Familier og turfolk",
  benefits: ["Synlig i mørket", "Varm ull"],
  images: [],
};

describe("productPrompt", () => {
  it("tar med navn, bruk, målgruppe og fordeler i tekst og bilde", () => {
    const copy = productCopyLines(reflexHat).join("\n");
    expect(copy).toContain("Produkt: Nordlys reflekslue.");
    expect(copy).toContain("Hvor og når det brukes: Kveldstur med hunden, skoleveien i mørket");
    expect(copy).toContain("Hvem det er for: Familier og turfolk");
    expect(copy).toContain("Fordeler: Synlig i mørket; Varm ull.");

    const scene = productSceneDirection(reflexHat);
    expect(scene).toContain("natural use setting");
    expect(scene).toContain("Kveldstur med hunden");
    expect(scene).toContain("Familier og turfolk");
    expect(productTopic(reflexHat)).toBe("Nordlys reflekslue i bruk: Kveldstur med hunden, skoleveien i mørket");
  });

  it("utelater tomme felt og faller tilbake til hverdagsbruk", () => {
    const bare: Product = { ...reflexHat, description: "  ", usageSettings: undefined, targetAudience: "", benefits: [" "] };
    const copy = productCopyLines(bare).join("\n");
    expect(copy).not.toContain("Hva det er:");
    expect(copy).not.toContain("Hvor og når det brukes:");
    expect(copy).not.toContain("Hvem det er for:");
    expect(copy).not.toContain("Fordeler:");
    expect(productSceneDirection(bare)).toContain("never as an isolated studio object");
    expect(productTopic(bare)).toBe("Nordlys reflekslue i bruk");
  });
});

describe("productInputSchema", () => {
  it("rydder fordeler og tomme felt", () => {
    const parsed = productInputSchema.parse({
      name: "  Lue ",
      description: "",
      benefits: ["Varm", "Varm", ""],
      productUrl: "",
    });
    expect(parsed).toEqual({ name: "Lue", benefits: ["Varm"], description: undefined, usageSettings: undefined, targetAudience: undefined, productUrl: undefined });
  });

  it("avviser tomt navn og ugyldig lenke", () => {
    expect(productInputSchema.safeParse({ name: " " }).success).toBe(false);
    expect(productInputSchema.safeParse({ name: "Lue", productUrl: "ikke-en-lenke" }).success).toBe(false);
  });
});

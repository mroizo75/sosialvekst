import { describe, expect, it } from "vitest";

import { assembleCaption } from "@/lib/ai/generatePost";
import {
  productCopyLines,
  productOrderBlock,
  productSceneDirection,
  productTopic,
} from "@/lib/products/productPrompt";
import { orderContactSchema, productInputSchema } from "@/lib/products/validation";
import type { Product } from "@/lib/types";

const reflexHat: Product = {
  id: "8b0c6c55-6a52-4c1e-9d7e-3f0f3c1f8e11",
  name: "Nordlys reflekslue",
  description: "Strikket ullue med refleksgarn.",
  usageSettings: "Kveldstur med hunden, skoleveien i mørket",
  targetAudience: "Familier og turfolk",
  benefits: ["Synlig i mørket", "Varm ull"],
  contact: { messenger: true },
  images: [],
};

describe("productOrderBlock", () => {
  it("viser tilbudspris og lenke når produktet har nettbutikk", () => {
    const product: Product = { ...reflexHat, price: 399, salePrice: 299, productUrl: "https://butikk.no/lue" };
    expect(productOrderBlock(product, "facebook")).toBe("Nå 299 kr (før 399 kr)\nBestill her: https://butikk.no/lue");
  });

  it("ber kunden ta kontakt direkte når lenke mangler", () => {
    const product: Product = {
      ...reflexHat,
      price: 1299,
      contact: { messenger: true, email: "post@lue.no", phone: "900 00 000" },
    };
    expect(productOrderBlock(product, "facebook")).toBe(
      "Pris: 1 299 kr\nBestill: send oss en melding på Messenger, send e-post til post@lue.no eller ring 900 00 000.",
    );
  });

  it("faller tilbake til melding uten pris og kontaktinfo, og dropper lenke på TikTok", () => {
    const noContact: Product = { ...reflexHat, contact: { messenger: false } };
    expect(productOrderBlock(noContact, "instagram")).toBe("Bestill: send oss en melding her.");
    const tiktok: Product = { ...reflexHat, productUrl: "https://butikk.no/lue", contact: { messenger: false, phone: "900 00 000" } };
    expect(productOrderBlock(tiktok, "tiktok")).toBe("Bestill: ring 900 00 000.");
  });

  it("legger bestillingslinjen før hashtags og fjerner lenke AI skrev selv", () => {
    const caption = assembleCaption({
      body: "Mørke kvelder krever mer enn en varm lue.\nhttps://butikk.no/lue\n\n#refleks #hundetur",
      link: "https://butikk.no/lue",
      order: "Pris: 349 kr\nBestill her: https://butikk.no/lue",
      credits: "Foto: AI",
    });
    expect(caption).toBe(
      "Mørke kvelder krever mer enn en varm lue.\n\nPris: 349 kr\nBestill her: https://butikk.no/lue\n\n#refleks #hundetur\n\nFoto: AI",
    );
  });
});

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

  it("avviser tomt navn, ugyldig lenke og tilbudspris over ordinær pris", () => {
    expect(productInputSchema.safeParse({ name: " " }).success).toBe(false);
    expect(productInputSchema.safeParse({ name: "Lue", productUrl: "ikke-en-lenke" }).success).toBe(false);
    expect(productInputSchema.safeParse({ name: "Lue", price: 299, salePrice: 399 }).success).toBe(false);
    expect(productInputSchema.parse({ name: "Lue", price: 349.999, salePrice: null })).toMatchObject({ price: 350 });
  });
});

describe("orderContactSchema", () => {
  it("normaliserer telefon og e-post, og avviser ugyldige verdier", () => {
    expect(orderContactSchema.parse({ phone: " 900  00 000 ", email: "Post@Lue.no", messenger: false })).toEqual({
      phone: "900 00 000",
      email: "post@lue.no",
      messenger: false,
    });
    expect(orderContactSchema.safeParse({ phone: "ring meg", email: "", messenger: true }).success).toBe(false);
  });
});

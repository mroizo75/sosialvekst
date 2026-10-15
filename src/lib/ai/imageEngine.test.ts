import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductMatch } from "@/lib/ai/productFidelity";
import type { Product } from "@/lib/types";

const edit = vi.fn();
const fal = vi.hoisted(() => ({
  available: false,
  productEdit: vi.fn(async (): Promise<{ url: string } | null> => ({ url: "https://fal.test/edit.png" })),
  packshot: vi.fn(async () => ({ url: "https://fal.test/packshot.png" })),
}));
const fidelity = vi.hoisted(() => ({
  appearance: "Light grey ribbed knit beanie with folded cuff and a small tan leather patch.",
  verify: vi.fn(async (): Promise<ProductMatch | null> => ({ match: true, differences: "" })),
}));

vi.mock("@/lib/openai", () => ({
  getOpenAiClient: () => ({ images: { edit } }),
}));
vi.mock("@/lib/cloudflare/r2", () => ({
  uploadUserFile: vi.fn(async () => ({ publicUrl: "https://cdn.test/scene.png" })),
}));
vi.mock("@/lib/ai/falClient", () => ({
  isFalAvailable: () => fal.available,
  generateProductEdit: fal.productEdit,
  generateFlexEdit: vi.fn(async () => null),
  generateProductPhotography: fal.packshot,
}));
vi.mock("@/lib/ai/productFidelity", () => ({
  describeProductAppearance: vi.fn(async () => fidelity.appearance),
  verifyProductMatch: fidelity.verify,
}));

const { generateProductImage } = await import("@/lib/ai/imageEngine");

const hat: Product = {
  id: "8a899b3c-5610-4fba-9e9b-14316ae3744d",
  name: "Nordlys reflekslue",
  usageSettings: "Kveldstur med hunden",
  benefits: [],
  contact: { messenger: true },
  images: [
    { id: "a", imageUrl: "https://cdn.test/lue-1.jpg", sortOrder: 0 },
    { id: "b", imageUrl: "https://cdn.test/lue-2.png", sortOrder: 1 },
  ],
};

const openAiImage = { data: [{ b64_json: Buffer.from("png").toString("base64") }] };

describe("generateProductImage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": url.endsWith(".png") ? "image/png" : "image/jpeg" },
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    edit.mockReset();
    fal.productEdit.mockClear();
    fal.packshot.mockClear();
    fal.available = false;
    fidelity.verify.mockReset();
    fidelity.verify.mockResolvedValue({ match: true, differences: "" });
  });

  it("bruker den produkttro modellen først, med produktbildene og den eksakte beskrivelsen", async () => {
    fal.available = true;

    const result = await generateProductImage({ userId: "u1", channel: "instagram", topic: "Lue i bruk", product: hat });

    expect(result).toEqual({ url: "https://cdn.test/scene.png", engine: "fal_product_edit" });
    const args = fal.productEdit.mock.calls[0] as unknown as [{ prompt: string; imageUrls: string[] }];
    expect(args[0].imageUrls).toEqual(["https://cdn.test/lue-1.jpg", "https://cdn.test/lue-2.png"]);
    expect(args[0].prompt).toContain("tan leather patch");
    expect(args[0].prompt).toContain("Kveldstur med hunden");
    expect(edit).not.toHaveBeenCalled();
  });

  it("forkaster bilder der produktet er endret og prøver neste motor", async () => {
    fal.available = true;
    fidelity.verify
      .mockResolvedValueOnce({ match: false, differences: "white beanie, no leather patch" })
      .mockResolvedValueOnce({ match: true, differences: "" });
    edit.mockResolvedValue(openAiImage);

    const result = await generateProductImage({ userId: "u1", channel: "facebook", topic: "Lue", product: hat });

    expect(result?.engine).toBe("openai_edit");
    const args = edit.mock.calls[0][0] as { image: File[]; input_fidelity: string };
    expect(args.input_fidelity).toBe("high");
    expect(args.image.map((file) => file.type)).toEqual(["image/jpeg", "image/png"]);
  });

  it("gir karusell-slides en egen vinkel og bruker aldri packshot der", async () => {
    fal.available = true;
    fal.productEdit.mockResolvedValueOnce(null);
    edit.mockRejectedValue(new Error("rate limit"));

    const slide = await generateProductImage({ userId: "u1", channel: "instagram", topic: "Lue", product: hat, variation: "Synlig på hundetur" });

    expect(slide).toBeNull();
    expect(edit.mock.calls[0][0].prompt).toContain("Synlig på hundetur");
    expect(fal.packshot).not.toHaveBeenCalled();
  });

  it("gir null når alle bilder avvises, så et endret produkt aldri publiseres", async () => {
    fal.available = true;
    fidelity.verify.mockResolvedValue({ match: false, differences: "different colour" });
    edit.mockResolvedValue(openAiImage);

    const result = await generateProductImage({ userId: "u1", channel: "instagram", topic: "Lue", product: hat });

    expect(result).toBeNull();
    expect(fal.packshot).toHaveBeenCalledTimes(1);
  });
});

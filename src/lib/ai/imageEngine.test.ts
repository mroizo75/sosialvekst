import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Product } from "@/lib/types";

const edit = vi.fn();

vi.mock("@/lib/openai", () => ({
  getOpenAiClient: () => ({ images: { edit } }),
}));
vi.mock("@/lib/cloudflare/r2", () => ({
  uploadUserFile: vi.fn(async () => ({ publicUrl: "https://cdn.test/scene.png" })),
}));
vi.mock("@/lib/ai/falClient", () => ({
  isFalAvailable: () => false,
  generateFlexEdit: vi.fn(async () => null),
  generateProductPhotography: vi.fn(async () => null),
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
  });

  it("sender de opplastede produktbildene som filer med høy gjengivelse", async () => {
    edit.mockResolvedValue({ data: [{ b64_json: Buffer.from("png").toString("base64") }] });

    const result = await generateProductImage({ userId: "u1", channel: "facebook", topic: "Lue i bruk", product: hat });

    expect(result).toEqual({ url: "https://cdn.test/scene.png", engine: "openai_edit" });
    const args = edit.mock.calls[0][0] as { image: File[]; input_fidelity: string; prompt: string };
    expect(args.input_fidelity).toBe("high");
    expect(args.image).toHaveLength(2);
    expect(args.image.every((file) => file instanceof File)).toBe(true);
    expect(args.image.map((file) => file.type)).toEqual(["image/jpeg", "image/png"]);
    expect(args.prompt).toContain("Kveldstur med hunden");
  });

  it("gir null når alle motorer feiler, så det aldri lages et generisk produkt", async () => {
    edit.mockRejectedValue(new Error("rate limit"));

    const result = await generateProductImage({ userId: "u1", channel: "instagram", topic: "Lue", product: hat });

    expect(result).toBeNull();
  });
});

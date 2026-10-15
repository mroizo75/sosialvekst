import { z } from "zod";

import { logger } from "@/lib/logger";
import { getOpenAiClient } from "@/lib/openai";
import type { Product } from "@/lib/types";

const VISION_MODEL = "gpt-4.1";
const MAX_REFERENCE_IMAGES = 4;

const matchSchema = z.object({
  match: z.boolean(),
  differences: z.string(),
});

export type ProductMatch = z.infer<typeof matchSchema>;

const appearanceCache = new Map<string, Promise<string | null>>();

const referenceImages = (product: Product) =>
  product.images.slice(0, MAX_REFERENCE_IMAGES).map((image) => ({
    type: "input_image" as const,
    image_url: image.imageUrl,
    detail: "high" as const,
  }));

const productLabel = (product: Product): string =>
  product.description?.trim() ? `"${product.name}" (${product.description.trim()})` : `"${product.name}"`;

const parseJson = (text: string): unknown => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Svaret inneholdt ikke JSON");
  return JSON.parse(text.slice(start, end + 1));
};

const fetchAppearance = async (product: Product): Promise<string | null> => {
  const client = getOpenAiClient();
  if (!client || product.images.length === 0) return null;

  try {
    const response = await client.responses.create({
      model: VISION_MODEL,
      max_output_tokens: 220,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `These photos show the product ${productLabel(product)}.`,
                "Describe only the product itself so an image model can recreate it exactly: type, exact colour, material and texture, shape, proportions, and every distinguishing detail such as patches, labels, logos, seams and their position.",
                "Name any props that are not the product (mannequin, stand, boxes, backdrop) in one final sentence starting with 'Not part of the product:'.",
                "Plain English, max 90 words, no marketing language.",
              ].join(" "),
            },
            ...referenceImages(product),
          ],
        },
      ],
    });
    const appearance = (response.output_text || "").replace(/\s+/g, " ").trim();
    return appearance || null;
  } catch (error) {
    logger.warn("Kunne ikke beskrive produktet fra bildene", {
      productId: product.id,
      error: error instanceof Error ? error.message : "ukjent",
    });
    return null;
  }
};

const appearanceKey = (product: Product): string =>
  [product.id, ...product.images.map((image) => image.imageUrl)].join("|");

export const describeProductAppearance = (product: Product): Promise<string | null> => {
  const key = appearanceKey(product);
  const cached = appearanceCache.get(key);
  if (cached) return cached;
  const pending = fetchAppearance(product).then((appearance) => {
    if (!appearance) appearanceCache.delete(key);
    return appearance;
  });
  appearanceCache.set(key, pending);
  return pending;
};

export const verifyProductMatch = async (product: Product, generatedUrl: string): Promise<ProductMatch | null> => {
  const client = getOpenAiClient();
  if (!client) return null;

  try {
    const response = await client.responses.create({
      model: VISION_MODEL,
      max_output_tokens: 160,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `The first images are reference photos of the product ${productLabel(product)}. The LAST image is an AI-generated advert.`,
                "Is the product in the last image clearly the same product as in the references? Compare type, colour, material texture, shape and distinguishing details such as patches, labels and logos.",
                "Ignore background, people, lighting, camera angle, mannequins, stands and packaging boxes.",
                "Answer false if the product is missing, a different colour, a different texture or missing a distinguishing detail.",
                'Reply with JSON only: {"match": boolean, "differences": "short English list, empty if none"}.',
              ].join(" "),
            },
            ...referenceImages(product),
            { type: "input_image", image_url: generatedUrl, detail: "high" },
          ],
        },
      ],
    });
    return matchSchema.parse(parseJson(response.output_text || ""));
  } catch (error) {
    logger.warn("Kunne ikke kontrollere produktbildet", {
      productId: product.id,
      error: error instanceof Error ? error.message : "ukjent",
    });
    return null;
  }
};

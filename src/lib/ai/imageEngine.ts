import { toFile } from "openai";

import {
  generateFlexEdit,
  generateProductEdit,
  generateProductPhotography,
  isFalAvailable,
} from "@/lib/ai/falClient";
import { describeProductAppearance, verifyProductMatch } from "@/lib/ai/productFidelity";
import { buildProductScenePrompt } from "@/lib/ai/productScenePrompt";
import { uploadUserFile } from "@/lib/cloudflare/r2";
import { logger } from "@/lib/logger";
import { getOpenAiClient } from "@/lib/openai";
import type { BrandContext, Product, SocialChannel } from "@/lib/types";

type ImageEngineInput = {
  userId: string;
  channel: SocialChannel;
  topic: string;
  product: Product;
  brandContext?: BrandContext;
  format?: string;
  variation?: string;
};

type EngineName = "fal_product_edit" | "openai_edit" | "fal_flex_edit" | "fal_product_photo";

type EngineResult = {
  url: string;
  engine: EngineName;
};

type Engine = {
  name: EngineName;
  run: (input: ImageEngineInput, prompt: string) => Promise<Uint8Array | null>;
};

const MAX_REFERENCE_IMAGES = 4;

const CHANNEL_ASPECT_RATIO: Record<SocialChannel, "1:1" | "16:9" | "9:16" | "4:3" | "3:4"> = {
  instagram: "1:1",
  facebook: "16:9",
  linkedin: "16:9",
  tiktok: "9:16",
};

const CHANNEL_IMAGE_SIZE: Record<SocialChannel, "square_hd" | "landscape_16_9" | "portrait_16_9"> = {
  instagram: "square_hd",
  facebook: "landscape_16_9",
  linkedin: "landscape_16_9",
  tiktok: "portrait_16_9",
};

const OPENAI_IMAGE_SIZE: Record<SocialChannel, "1024x1024" | "1536x1024" | "1024x1536"> = {
  instagram: "1024x1024",
  facebook: "1536x1024",
  linkedin: "1536x1024",
  tiktok: "1024x1536",
};

const OPENAI_EDIT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const referenceUrls = (product: Product): string[] =>
  product.images.slice(0, MAX_REFERENCE_IMAGES).map((image) => image.imageUrl);

const fetchImageBytes = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Kunne ikke hente bilde fra URL (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

const contentTypeFor = (url: string, header: string | null): string => {
  const declared = header?.split(";")[0]?.trim().toLowerCase();
  if (declared && OPENAI_EDIT_TYPES.has(declared)) return declared;
  const path = url.toLowerCase().split("?")[0];
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
};

const fetchReferenceFile = async (url: string, index: number): Promise<File> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Kunne ikke hente produktbilde ${index + 1} (${response.status})`);
  }
  const type = contentTypeFor(url, response.headers.get("content-type"));
  const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return toFile(await response.arrayBuffer(), `product-${index + 1}.${extension}`, { type });
};

const uploadResultImage = async (userId: string, imageBytes: Uint8Array): Promise<string> => {
  const uploaded = await uploadUserFile({
    userId,
    fileName: `product-scene-${crypto.randomUUID()}.png`,
    contentType: "image/png",
    mediaKind: "image",
    body: imageBytes,
  });
  return uploaded.publicUrl;
};

const runFalProductEdit = async (input: ImageEngineInput, prompt: string): Promise<Uint8Array | null> => {
  if (!isFalAvailable()) return null;
  const result = await generateProductEdit({
    prompt,
    imageUrls: referenceUrls(input.product),
    aspectRatio: CHANNEL_ASPECT_RATIO[input.channel],
  });
  return result?.url ? fetchImageBytes(result.url) : null;
};

const runOpenAiEdit = async (input: ImageEngineInput, prompt: string): Promise<Uint8Array | null> => {
  const client = getOpenAiClient();
  if (!client) return null;

  const imageFiles = await Promise.all(referenceUrls(input.product).map(fetchReferenceFile));
  const response = await client.images.edit({
    model: "gpt-image-1",
    prompt,
    image: imageFiles,
    input_fidelity: "high",
    size: OPENAI_IMAGE_SIZE[input.channel],
    quality: "medium",
  });

  const payload = response.data?.[0];
  if (payload?.b64_json) return new Uint8Array(Buffer.from(payload.b64_json, "base64"));
  if (payload?.url) return fetchImageBytes(payload.url);
  return null;
};

const runFalFlexEdit = async (input: ImageEngineInput, prompt: string): Promise<Uint8Array | null> => {
  if (!isFalAvailable()) return null;
  const result = await generateFlexEdit({
    prompt,
    imageUrls: referenceUrls(input.product),
    imageSize: CHANNEL_IMAGE_SIZE[input.channel],
  });
  return result?.url ? fetchImageBytes(result.url) : null;
};

const runFalProductPhoto = async (input: ImageEngineInput): Promise<Uint8Array | null> => {
  if (!isFalAvailable()) return null;
  const result = await generateProductPhotography({
    productImageUrl: input.product.images[0].imageUrl,
    aspectRatio: CHANNEL_ASPECT_RATIO[input.channel],
  });
  return result?.url ? fetchImageBytes(result.url) : null;
};

const SCENE_ENGINES: Engine[] = [
  { name: "fal_product_edit", run: runFalProductEdit },
  { name: "openai_edit", run: runOpenAiEdit },
  { name: "fal_flex_edit", run: runFalFlexEdit },
];

// The packshot engine ignores the prompt, so on carousel slides it would repeat the cover's shot.
const enginesFor = (input: ImageEngineInput): Engine[] =>
  input.variation ? SCENE_ENGINES : [...SCENE_ENGINES, { name: "fal_product_photo", run: runFalProductPhoto }];

const toDataUrl = (bytes: Uint8Array): string => `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;

const tryEngine = async (
  engine: Engine,
  input: ImageEngineInput,
  prompt: string,
): Promise<Uint8Array | null> => {
  try {
    const bytes = await engine.run(input, prompt);
    if (!bytes) return null;

    const check = await verifyProductMatch(input.product, toDataUrl(bytes));
    if (check && !check.match) {
      logger.warn("Produktbildet ble forkastet fordi produktet var endret", {
        userId: input.userId,
        engine: engine.name,
        differences: check.differences.slice(0, 300),
      });
      return null;
    }
    return bytes;
  } catch (error) {
    logger.warn("Produktbildemotor feilet", {
      userId: input.userId,
      engine: engine.name,
      error: error instanceof Error ? error.message : "ukjent",
    });
    return null;
  }
};

export const generateProductImage = async (
  input: ImageEngineInput,
): Promise<EngineResult | null> => {
  if (input.product.images.length === 0) return null;

  const appearance = await describeProductAppearance(input.product);
  const prompt = buildProductScenePrompt({
    topic: input.topic,
    channel: input.channel,
    product: input.product,
    brandContext: input.brandContext,
    format: input.format,
    variation: input.variation,
    appearance: appearance ?? undefined,
  });

  for (const engine of enginesFor(input)) {
    const bytes = await tryEngine(engine, input, prompt);
    if (bytes) return { url: await uploadResultImage(input.userId, bytes), engine: engine.name };
  }
  return null;
};

import { toFile } from "openai";

import { generateFlexEdit, generateProductPhotography, isFalAvailable } from "@/lib/ai/falClient";
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
};

const MAX_REFERENCE_IMAGES = 4;

type EngineResult = {
  url: string;
  engine: "openai_edit" | "fal_product_photo" | "fal_flex_edit";
};

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

const tryOpenAiEdit = async (input: ImageEngineInput): Promise<EngineResult | null> => {
  const client = getOpenAiClient();
  if (!client) return null;

  const scenePrompt = buildProductScenePrompt({
    topic: input.topic,
    channel: input.channel,
    product: input.product,
    brandContext: input.brandContext,
    format: input.format,
  });

  try {
    const imageFiles = await Promise.all(
      input.product.images
        .slice(0, MAX_REFERENCE_IMAGES)
        .map((image, index) => fetchReferenceFile(image.imageUrl, index)),
    );

    const response = await client.images.edit({
      model: "gpt-image-1",
      prompt: scenePrompt,
      image: imageFiles,
      input_fidelity: "high",
      size: OPENAI_IMAGE_SIZE[input.channel],
      quality: "medium",
    });

    const payload = response.data?.[0];
    if (!payload) return null;

    let imageBytes: Uint8Array | null = null;
    if (payload.b64_json) {
      imageBytes = new Uint8Array(Buffer.from(payload.b64_json, "base64"));
    } else if (payload.url) {
      imageBytes = await fetchImageBytes(payload.url);
    }
    if (!imageBytes) return null;

    const publicUrl = await uploadResultImage(input.userId, imageBytes);
    return { url: publicUrl, engine: "openai_edit" };
  } catch (error) {
    logger.warn("OpenAI images.edit feilet", {
      userId: input.userId,
      error: error instanceof Error ? error.message : "ukjent",
    });
    return null;
  }
};

const tryFalProductPhoto = async (input: ImageEngineInput): Promise<EngineResult | null> => {
  if (!isFalAvailable()) return null;

  const result = await generateProductPhotography({
    productImageUrl: input.product.images[0].imageUrl,
    aspectRatio: CHANNEL_ASPECT_RATIO[input.channel],
  });

  if (!result?.url) return null;

  const imageBytes = await fetchImageBytes(result.url);
  const publicUrl = await uploadResultImage(input.userId, imageBytes);
  return { url: publicUrl, engine: "fal_product_photo" };
};

const tryFalFlexEdit = async (input: ImageEngineInput): Promise<EngineResult | null> => {
  if (!isFalAvailable()) return null;

  const scenePrompt = buildProductScenePrompt({
    topic: input.topic,
    channel: input.channel,
    product: input.product,
    brandContext: input.brandContext,
    format: input.format,
  });

  const imageUrls = input.product.images.slice(0, MAX_REFERENCE_IMAGES).map((pi) => pi.imageUrl);

  const result = await generateFlexEdit({
    prompt: scenePrompt,
    imageUrls,
    imageSize: CHANNEL_IMAGE_SIZE[input.channel],
  });

  if (!result?.url) return null;

  const imageBytes = await fetchImageBytes(result.url);
  const publicUrl = await uploadResultImage(input.userId, imageBytes);
  return { url: publicUrl, engine: "fal_flex_edit" };
};

export const generateProductImage = async (
  input: ImageEngineInput,
): Promise<EngineResult | null> => {
  if (input.product.images.length === 0) return null;

  // The fal packshot engine cannot place the product in a scene, so it is only the last resort.
  const openaiResult = await tryOpenAiEdit(input);
  if (openaiResult) return openaiResult;

  const flexResult = await tryFalFlexEdit(input);
  if (flexResult) return flexResult;

  return tryFalProductPhoto(input);
};

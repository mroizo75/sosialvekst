import { generateFlexEdit, generateProductPhotography, isFalAvailable } from "@/lib/ai/falClient";
import { buildProductScenePrompt } from "@/lib/ai/productScenePrompt";
import { uploadUserFile } from "@/lib/cloudflare/r2";
import { logger } from "@/lib/logger";
import { getOpenAiClient } from "@/lib/openai";
import type { BrandContext, ProductImage, SocialChannel } from "@/lib/types";

type ImageEngineInput = {
  userId: string;
  channel: SocialChannel;
  topic: string;
  productImages: ProductImage[];
  brandContext?: BrandContext;
  format?: string;
};

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

const OPENAI_IMAGE_SIZE: Record<SocialChannel, string> = {
  instagram: "1024x1024",
  facebook: "1536x1024",
  linkedin: "1536x1024",
  tiktok: "1024x1536",
};

const fetchImageBytes = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Kunne ikke hente bilde fra URL (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
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
    productName: input.productImages[0].productName,
    brandContext: input.brandContext,
    format: input.format,
  });

  const referenceImages = input.productImages.slice(0, 4);
  const imageFiles: Array<{ url: string; detail?: string }> = referenceImages.map((pi) => ({
    url: pi.imageUrl,
    detail: "high" as const,
  }));

  try {
    const imageClient = client as unknown as {
      images: {
        edit: (args: {
          model: string;
          prompt: string;
          image: Array<{ url: string; detail?: string }>;
          size: string;
          quality: string;
        }) => Promise<{ data?: Array<{ b64_json?: string; url?: string }> }>;
      };
    };

    const response = await imageClient.images.edit({
      model: "gpt-image-1",
      prompt: scenePrompt,
      image: imageFiles,
      size: OPENAI_IMAGE_SIZE[input.channel],
      quality: "high",
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
    productImageUrl: input.productImages[0].imageUrl,
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
    productName: input.productImages[0].productName,
    brandContext: input.brandContext,
    format: input.format,
  });

  const imageUrls = input.productImages.slice(0, 4).map((pi) => pi.imageUrl);

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
  if (input.productImages.length === 0) return null;

  const isLifestyleFormat = input.format === "behind_the_scenes"
    || input.format === "case_study"
    || input.format === "how_to";

  if (isLifestyleFormat) {
    const flexResult = await tryFalFlexEdit(input);
    if (flexResult) return flexResult;

    const openaiResult = await tryOpenAiEdit(input);
    if (openaiResult) return openaiResult;

    return tryFalProductPhoto(input);
  }

  const openaiResult = await tryOpenAiEdit(input);
  if (openaiResult) return openaiResult;

  const flexResult = await tryFalFlexEdit(input);
  if (flexResult) return flexResult;

  return tryFalProductPhoto(input);
};

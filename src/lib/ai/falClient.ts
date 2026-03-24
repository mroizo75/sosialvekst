import { logger } from "@/lib/logger";

type FalImageResult = {
  url: string;
  width?: number;
  height?: number;
};

type ProductPhotographyInput = {
  productImageUrl: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
};

type FlexEditInput = {
  prompt: string;
  imageUrls: string[];
  imageSize?: "auto" | "square_hd" | "square" | "portrait_4_3" | "portrait_16_9" | "landscape_4_3" | "landscape_16_9";
  guidanceScale?: number;
  numInferenceSteps?: number;
};

const getFalKey = (): string | null => {
  return process.env.FAL_KEY ?? null;
};

const falFetch = async <T>(endpointId: string, input: Record<string, unknown>): Promise<T> => {
  const apiKey = getFalKey();
  if (!apiKey) {
    throw new Error("FAL_KEY mangler i miljøvariabler.");
  }

  const response = await fetch(`https://queue.fal.run/${endpointId}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`fal.ai ${endpointId} feilet (${response.status}): ${body.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
};

export const generateProductPhotography = async (
  input: ProductPhotographyInput,
): Promise<FalImageResult | null> => {
  if (!getFalKey()) return null;

  try {
    const result = await falFetch<{ images?: FalImageResult[] }>(
      "fal-ai/image-apps-v2/product-photography",
      {
        product_image_url: input.productImageUrl,
        ...(input.aspectRatio ? { aspect_ratio: { ratio: input.aspectRatio } } : {}),
      },
    );

    return result.images?.[0] ?? null;
  } catch (error) {
    logger.warn("fal.ai produktfotografi feilet", {
      error: error instanceof Error ? error.message : "ukjent",
    });
    return null;
  }
};

export const generateFlexEdit = async (
  input: FlexEditInput,
): Promise<FalImageResult | null> => {
  if (!getFalKey()) return null;

  try {
    const result = await falFetch<{ images?: FalImageResult[] }>(
      "fal-ai/flux-2-flex/edit",
      {
        prompt: input.prompt,
        image_urls: input.imageUrls,
        image_size: input.imageSize ?? "auto",
        guidance_scale: input.guidanceScale ?? 3.5,
        num_inference_steps: input.numInferenceSteps ?? 28,
        output_format: "png",
      },
    );

    return result.images?.[0] ?? null;
  } catch (error) {
    logger.warn("fal.ai FLUX.2 flex/edit feilet", {
      error: error instanceof Error ? error.message : "ukjent",
    });
    return null;
  }
};

export const isFalAvailable = (): boolean => {
  return Boolean(getFalKey());
};

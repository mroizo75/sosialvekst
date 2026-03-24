import { logger } from "@/lib/logger";

type FalImageResult = {
  url: string;
  width?: number;
  height?: number;
};

type FalVideoResult = {
  url: string;
  content_type?: string;
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

export type ImageToVideoInput = {
  prompt: string;
  imageUrl: string;
  duration?: "5" | "10";
  resolution?: "480p" | "720p" | "1080p";
};

const getFalKey = (): string | null => {
  return process.env.FAL_KEY ?? null;
};

const FAL_QUEUE_POLL_INTERVAL_MS = 3_000;
const FAL_QUEUE_MAX_WAIT_MS = 180_000;

const falFetchSync = async <T>(endpointId: string, input: Record<string, unknown>): Promise<T> => {
  const apiKey = getFalKey();
  if (!apiKey) {
    throw new Error("FAL_KEY mangler i miljøvariabler.");
  }

  const response = await fetch(`https://fal.run/${endpointId}`, {
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

const falFetchQueued = async <T>(endpointId: string, input: Record<string, unknown>): Promise<T> => {
  const apiKey = getFalKey();
  if (!apiKey) {
    throw new Error("FAL_KEY mangler i miljøvariabler.");
  }

  const headers = {
    Authorization: `Key ${apiKey}`,
    "Content-Type": "application/json",
  };

  const submitResponse = await fetch(`https://queue.fal.run/${endpointId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });

  if (!submitResponse.ok) {
    const body = await submitResponse.text().catch(() => "");
    throw new Error(`fal.ai ${endpointId} submit feilet (${submitResponse.status}): ${body.slice(0, 300)}`);
  }

  const submitData = (await submitResponse.json()) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
  };

  if (!submitData.request_id) {
    throw new Error(`fal.ai ${endpointId} returnerte ingen request_id.`);
  }

  const statusBase = `https://queue.fal.run/${endpointId}/requests/${submitData.request_id}`;
  const startTime = Date.now();

  while (Date.now() - startTime < FAL_QUEUE_MAX_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, FAL_QUEUE_POLL_INTERVAL_MS));

    const statusResponse = await fetch(`${statusBase}/status`, { headers });
    if (!statusResponse.ok) continue;

    const statusData = (await statusResponse.json()) as { status?: string };
    if (statusData.status === "COMPLETED") {
      const resultResponse = await fetch(statusBase, { headers });
      if (!resultResponse.ok) {
        const body = await resultResponse.text().catch(() => "");
        throw new Error(`fal.ai ${endpointId} resultat feilet (${resultResponse.status}): ${body.slice(0, 300)}`);
      }
      return resultResponse.json() as Promise<T>;
    }

    if (statusData.status === "FAILED") {
      throw new Error(`fal.ai ${endpointId} jobb feilet.`);
    }
  }

  throw new Error(`fal.ai ${endpointId} timeout etter ${FAL_QUEUE_MAX_WAIT_MS / 1000}s.`);
};

export const generateProductPhotography = async (
  input: ProductPhotographyInput,
): Promise<FalImageResult | null> => {
  if (!getFalKey()) return null;

  try {
    const result = await falFetchSync<{ images?: FalImageResult[] }>(
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
    const result = await falFetchSync<{ images?: FalImageResult[] }>(
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

export const generateImageToVideo = async (
  input: ImageToVideoInput,
): Promise<FalVideoResult | null> => {
  if (!getFalKey()) return null;

  try {
    const result = await falFetchQueued<{ video?: FalVideoResult }>(
      "fal-ai/wan-25-preview/image-to-video",
      {
        prompt: input.prompt,
        image_url: input.imageUrl,
        duration: input.duration ?? "5",
        resolution: input.resolution ?? "720p",
        negative_prompt: "blur, distort, low quality, watermark, text overlay",
        enable_prompt_expansion: true,
        enable_safety_checker: true,
      },
    );

    return result.video ?? null;
  } catch (error) {
    logger.warn("fal.ai Wan 2.5 image-to-video feilet", {
      error: error instanceof Error ? error.message : "ukjent",
    });
    return null;
  }
};

export const isFalAvailable = (): boolean => {
  return Boolean(getFalKey());
};

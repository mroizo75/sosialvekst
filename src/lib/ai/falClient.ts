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

const FAL_QUEUE_INITIAL_POLL_MS = 5_000;
const FAL_QUEUE_MAX_POLL_MS = 15_000;
const FAL_QUEUE_MAX_WAIT_MS = 420_000;

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

  const statusBase = submitData.status_url
    ?? `https://queue.fal.run/${endpointId}/requests/${submitData.request_id}`;
  const responseBase = submitData.response_url
    ?? `https://queue.fal.run/${endpointId}/requests/${submitData.request_id}`;
  const startTime = Date.now();
  let pollInterval = FAL_QUEUE_INITIAL_POLL_MS;
  let pollCount = 0;

  logger.info(`[fal.ai] Jobb sendt til kø`, {
    endpoint: endpointId,
    requestId: submitData.request_id,
    statusUrl: statusBase,
  });

  while (Date.now() - startTime < FAL_QUEUE_MAX_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    pollInterval = Math.min(pollInterval * 1.5, FAL_QUEUE_MAX_POLL_MS);
    pollCount += 1;

    const statusUrl = statusBase.includes("/status") ? statusBase : `${statusBase}/status`;
    const statusResponse = await fetch(statusUrl, { headers });
    if (!statusResponse.ok) {
      logger.warn(`[fal.ai] Status-poll feilet`, {
        endpoint: endpointId,
        poll: pollCount,
        httpStatus: statusResponse.status,
      });
      continue;
    }

    const statusData = (await statusResponse.json()) as {
      status?: string;
      queue_position?: number;
      response_url?: string;
    };

    if (pollCount <= 3 || pollCount % 5 === 0) {
      logger.info(`[fal.ai] Status-poll`, {
        endpoint: endpointId,
        poll: pollCount,
        status: statusData.status,
        queuePosition: statusData.queue_position,
        elapsedMs: Date.now() - startTime,
      });
    }

    if (statusData.status === "COMPLETED") {
      const resultUrl = statusData.response_url ?? responseBase;
      const resultResponse = await fetch(resultUrl, { headers });
      if (!resultResponse.ok) {
        const body = await resultResponse.text().catch(() => "");
        throw new Error(`fal.ai ${endpointId} resultat feilet (${resultResponse.status}): ${body.slice(0, 300)}`);
      }
      logger.info(`[fal.ai] Jobb fullført`, {
        endpoint: endpointId,
        elapsedMs: Date.now() - startTime,
        polls: pollCount,
      });
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
      "fal-ai/minimax/hailuo-02-fast/image-to-video",
      {
        prompt: input.prompt,
        image_url: input.imageUrl,
        duration: "6",
        prompt_optimizer: true,
      },
    );

    return result.video ?? null;
  } catch (error) {
    logger.warn("fal.ai Hailuo Fast image-to-video feilet", {
      error: error instanceof Error ? error.message : "ukjent",
    });
    return null;
  }
};

export type TextToVideoInput = {
  prompt: string;
  promptOptimizer?: boolean;
};

export const generateTextToVideo = async (
  input: TextToVideoInput,
): Promise<FalVideoResult | null> => {
  if (!getFalKey()) return null;

  try {
    const result = await falFetchQueued<{ video?: FalVideoResult }>(
      "fal-ai/minimax/video-01",
      {
        prompt: input.prompt,
        prompt_optimizer: input.promptOptimizer ?? true,
      },
    );

    return result.video ?? null;
  } catch (error) {
    logger.warn("fal.ai minimax text-to-video feilet", {
      error: error instanceof Error ? error.message : "ukjent",
    });
    return null;
  }
};

/* ─── Veo 3 Fast: tekst til video med lyd ─── */

export type Veo3Input = {
  prompt: string;
  duration?: 4 | 6 | 8;
  aspectRatio?: "16:9" | "9:16";
  resolution?: "720p" | "1080p";
  generateAudio?: boolean;
};

export const generateVeo3Video = async (
  input: Veo3Input,
): Promise<FalVideoResult | null> => {
  if (!getFalKey()) return null;

  try {
    const result = await falFetchQueued<{ video?: FalVideoResult }>(
      "fal-ai/veo3/fast",
      {
        prompt: input.prompt,
        duration: String(input.duration ?? 8),
        aspect_ratio: input.aspectRatio ?? "16:9",
        resolution: input.resolution ?? "720p",
        generate_audio: input.generateAudio ?? true,
      },
    );

    return result.video ?? null;
  } catch (error) {
    logger.warn("fal.ai Veo 3 Fast text-to-video feilet", {
      error: error instanceof Error ? error.message : "ukjent",
    });
    return null;
  }
};

/* ─── Kling v3 Pro: bilde til video med lyd ─── */

export type KlingV3Input = {
  prompt: string;
  imageUrl: string;
  duration?: 5 | 10;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  generateAudio?: boolean;
};

export const generateKlingVideo = async (
  input: KlingV3Input,
): Promise<FalVideoResult | null> => {
  if (!getFalKey()) return null;

  try {
    const result = await falFetchQueued<{ video?: FalVideoResult }>(
      "fal-ai/kling-video/v3/pro/image-to-video",
      {
        prompt: input.prompt,
        image_url: input.imageUrl,
        duration: String(input.duration ?? 5),
        aspect_ratio: input.aspectRatio ?? "16:9",
        generate_audio: input.generateAudio ?? true,
      },
    );

    return result.video ?? null;
  } catch (error) {
    logger.warn("fal.ai Kling v3 Pro image-to-video feilet", {
      error: error instanceof Error ? error.message : "ukjent",
    });
    return null;
  }
};

export type VideoModel = "veo3" | "kling";

export const isFalAvailable = (): boolean => {
  return Boolean(getFalKey());
};

import { buildNorwegianCopyPrompt } from "@/lib/ai/copyPromptBuilderNo";
import { mergeBrandRules } from "@/lib/ai/brandRules";
import { generateProfessionalImage } from "@/lib/ai/imageGeneration";
import { buildImagePrompt } from "@/lib/ai/imagePromptBuilder";
import { evaluatePolicy } from "@/lib/ai/policyEngine";
import { runRevisionLoop } from "@/lib/ai/revisionLoop";
import { logger } from "@/lib/logger";
import { getOpenAiClient } from "@/lib/openai";
import type {
  BrandContext,
  ImageProfile,
  MediaMode,
  PostDraft,
  PostFormat,
  PostIntent,
  SocialChannel,
} from "@/lib/types";

type GeneratePostInput = {
  topic: string;
  channel: SocialChannel;
  scheduledAt: string;
  mediaMode: MediaMode;
  userId: string;
  brandContext?: BrandContext;
  intent?: PostIntent;
  format?: PostFormat;
  ctaType?: string;
  imageDirection?: string;
  imageProfile?: ImageProfile;
};

const fallbackText = (topic: string, companyName?: string): string => {
  const name = companyName ?? "din bedrift";
  return `${name} deler innsikt om ${topic}: slik bygger vi tillit med relevant og nyttig innhold. Hva er ditt neste steg?`;
};

const createText = async (input: GeneratePostInput): Promise<string> => {
  const client = getOpenAiClient();
  if (!client) {
    return fallbackText(input.topic, input.brandContext?.companyName);
  }

  const brandRules = mergeBrandRules({
    targetAudience: input.brandContext?.targetAudience,
    brandVoice: input.brandContext?.brandVoice,
    keyMessages: input.brandContext?.keyMessages,
  });

  const prompt = buildNorwegianCopyPrompt({
    topic: input.topic,
    channel: input.channel,
    brandRules,
    brandContext: input.brandContext,
    intent: input.intent,
    format: input.format,
    ctaType: input.ctaType,
  });

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    max_output_tokens: 240,
    input: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
  });

  return response.output_text || fallbackText(input.topic, input.brandContext?.companyName);
};

const createImageUrl = async (input: GeneratePostInput): Promise<string | undefined> => {
  if (input.mediaMode === "owned_only") {
    return undefined;
  }

  const brandRules = mergeBrandRules({
    targetAudience: input.brandContext?.targetAudience,
    brandVoice: input.brandContext?.brandVoice,
    keyMessages: input.brandContext?.keyMessages,
  });

  const imagePrompt = buildImagePrompt({
    topic: input.topic,
    channel: input.channel,
    mediaMode: input.mediaMode,
    brandRules,
    brandContext: input.brandContext,
    imageDirection: input.imageDirection,
    format: input.format,
  });

  return generateProfessionalImage({
    userId: input.userId,
    prompt: imagePrompt,
    profile: input.imageProfile,
  });
};

const createImageUrlWithRetry = async (input: GeneratePostInput): Promise<string | undefined> => {
  if (input.mediaMode === "owned_only") {
    return undefined;
  }

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const imageUrl = await createImageUrl(input);
      if (imageUrl) {
        if (attempt > 1) {
          logger.info("AI image generated after retry", {
            userId: input.userId,
            channel: input.channel,
            topic: input.topic,
            attempt,
          });
        }
        return imageUrl;
      }
    } catch (error) {
      logger.warn("AI image generation attempt failed", {
        userId: input.userId,
        channel: input.channel,
        topic: input.topic,
        attempt,
        error: error instanceof Error ? error.message : "unknown",
      });
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    }
  }

  return undefined;
};

export const generatePost = async (input: GeneratePostInput): Promise<PostDraft> => {
  let rawText = fallbackText(input.topic, input.brandContext?.companyName);
  try {
    rawText = await createText(input);
  } catch (error) {
    logger.warn("AI text generation failed, using fallback text", {
      userId: input.userId,
      channel: input.channel,
      topic: input.topic,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  let imageUrl: string | undefined;
  try {
    imageUrl = await createImageUrlWithRetry(input);
  } catch (error) {
    logger.warn("AI image generation failed, continuing without image", {
      userId: input.userId,
      channel: input.channel,
      topic: input.topic,
      error: error instanceof Error ? error.message : "unknown",
    });
    imageUrl = undefined;
  }

  const companyName = input.brandContext?.companyName;
  const revision = runRevisionLoop({
    initialText: rawText,
    imageUrl,
    companyName,
    maxAttempts: 2,
  });
  const decision = evaluatePolicy({
    text: revision.finalText,
    imageUrl,
    companyName,
  });

  return {
    id: crypto.randomUUID(),
    channel: input.channel,
    scheduledAt: input.scheduledAt,
    text: revision.finalText,
    imageUrl,
    status: decision.status,
    quality: decision.quality,
    intent: input.intent,
    format: input.format,
  };
};

import { buildNorwegianCopyPrompt } from "@/lib/ai/copyPromptBuilderNo";
import { mergeBrandRules } from "@/lib/ai/brandRules";
import { generateProfessionalImage } from "@/lib/ai/imageGeneration";
import { buildImagePrompt } from "@/lib/ai/imagePromptBuilder";
import { evaluatePolicy } from "@/lib/ai/policyEngine";
import { runRevisionLoop } from "@/lib/ai/revisionLoop";
import { listUserFiles } from "@/lib/cloudflare/r2";
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

type CachedOwnedImages = {
  expiresAt: number;
  urls: string[];
};

type OwnedImageCycle = {
  signature: string;
  order: string[];
  index: number;
  lastUsed?: string;
};

const OWNED_IMAGE_CACHE_TTL_MS = 60_000;
const ownedImageCache = new Map<string, CachedOwnedImages>();
const ownedImageCycle = new Map<string, OwnedImageCycle>();
const hybridSourceToggle = new Map<string, boolean>();

const fallbackText = (topic: string, companyName?: string): string => {
  const name = companyName ?? "din bedrift";
  return `${name} deler innsikt om ${topic}: slik bygger vi tillit med relevant og nyttig innhold. Hva er ditt neste steg?`;
};

const getMaxOutputTokens = (channel: SocialChannel): number => {
  if (channel === "facebook") return 520;
  if (channel === "linkedin") return 420;
  return 280;
};

const containsWebsiteUrl = (text: string, websiteUrl?: string): boolean => {
  if (!websiteUrl) return false;
  return text.includes(websiteUrl);
};

const ensureWebsiteLinkInText = (text: string, websiteUrl?: string): string => {
  if (!websiteUrl) return text.trim();
  if (containsWebsiteUrl(text, websiteUrl)) return text.trim();

  const trimmed = text.trim();
  const withEnding = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  return `${withEnding}\n\nLes mer: ${websiteUrl}`;
};

const ensureCompleteEnding = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
};

const isOwnedImageUrl = (url: string): boolean => {
  const lower = url.toLowerCase();
  return (
    lower.includes("/images/") &&
    !lower.includes("ai-image-")
  );
};

const shuffleUrls = (urls: string[]): string[] => {
  const copy = [...urls];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
};

const rotateAwayFromLastUsed = (urls: string[], lastUsed?: string): string[] => {
  if (!lastUsed || urls.length <= 1) {
    return urls;
  }
  if (urls[0] !== lastUsed) {
    return urls;
  }
  return [...urls.slice(1), urls[0]];
};

const getOwnedImageUrls = async (userId: string): Promise<string[]> => {
  const now = Date.now();
  const cached = ownedImageCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.urls;
  }

  try {
    const files = await listUserFiles(userId);
    const urls = files
      .map((file) => file.url)
      .filter(isOwnedImageUrl);

    ownedImageCache.set(userId, {
      expiresAt: now + OWNED_IMAGE_CACHE_TTL_MS,
      urls,
    });
    return urls;
  } catch (error) {
    logger.warn("Could not load owned media files", {
      userId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }
};

const pickOwnedImageUrl = async (input: GeneratePostInput): Promise<string | undefined> => {
  const ownedUrls = await getOwnedImageUrls(input.userId);
  if (ownedUrls.length === 0) {
    return undefined;
  }

  const signature = ownedUrls.join("|");
  const existingCycle = ownedImageCycle.get(input.userId);

  if (!existingCycle || existingCycle.signature !== signature) {
    const initialOrder = rotateAwayFromLastUsed(shuffleUrls(ownedUrls), existingCycle?.lastUsed);
    const first = initialOrder[0];
    ownedImageCycle.set(input.userId, {
      signature,
      order: initialOrder,
      index: 1,
      lastUsed: first,
    });
    return first;
  }

  if (existingCycle.index >= existingCycle.order.length) {
    const nextOrder = rotateAwayFromLastUsed(shuffleUrls(ownedUrls), existingCycle.lastUsed);
    const first = nextOrder[0];
    ownedImageCycle.set(input.userId, {
      signature,
      order: nextOrder,
      index: 1,
      lastUsed: first,
    });
    return first;
  }

  const picked = existingCycle.order[existingCycle.index];
  existingCycle.index += 1;
  existingCycle.lastUsed = picked;
  ownedImageCycle.set(input.userId, existingCycle);
  return picked;
};

const shouldUseOwnedInHybrid = (userId: string): boolean => {
  const current = hybridSourceToggle.get(userId) ?? true;
  hybridSourceToggle.set(userId, !current);
  return current;
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
    max_output_tokens: getMaxOutputTokens(input.channel),
    input: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
  });

  return response.output_text || fallbackText(input.topic, input.brandContext?.companyName);
};

const createImageUrl = async (input: GeneratePostInput): Promise<string | undefined> => {
  if (input.mediaMode === "owned_only") {
    return pickOwnedImageUrl(input);
  }

  if (input.mediaMode === "hybrid") {
    const ownedImageUrl = await pickOwnedImageUrl(input);
    if (ownedImageUrl) {
      const shouldUseOwned = shouldUseOwnedInHybrid(input.userId);
      if (shouldUseOwned) {
        return ownedImageUrl;
      }
    }
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
    return pickOwnedImageUrl(input);
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
      throw new Error("Bildegenerator returnerte tomt resultat.");
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
  const websiteUrl = input.brandContext?.websiteUrl?.trim();
  const revision = runRevisionLoop({
    initialText: rawText,
    imageUrl,
    companyName,
    maxAttempts: 2,
  });
  const normalizedText = ensureCompleteEnding(
    ensureWebsiteLinkInText(revision.finalText, websiteUrl),
  );
  const decision = evaluatePolicy({
    text: normalizedText,
    imageUrl,
    companyName,
  });

  return {
    id: crypto.randomUUID(),
    channel: input.channel,
    scheduledAt: input.scheduledAt,
    text: normalizedText,
    imageUrl,
    status: decision.status,
    quality: decision.quality,
    intent: input.intent,
    format: input.format,
  };
};

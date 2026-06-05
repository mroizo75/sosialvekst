import { buildNorwegianCopyPrompt } from "@/lib/ai/copyPromptBuilderNo";
import { mergeBrandRules } from "@/lib/ai/brandRules";
import { generateImageToVideo, isFalAvailable } from "@/lib/ai/falClient";
import { generateProfessionalImage, overlayLogoOnImage } from "@/lib/ai/imageGeneration";
import { generateProductImage } from "@/lib/ai/imageEngine";
import { buildImagePrompt } from "@/lib/ai/imagePromptBuilder";
import { evaluatePolicy } from "@/lib/ai/policyEngine";
import { runRevisionLoop } from "@/lib/ai/revisionLoop";
import { uploadUserFile, listUserFiles } from "@/lib/cloudflare/r2";
import { logger } from "@/lib/logger";
import { getOpenAiClient } from "@/lib/openai";
import type {
  BrandContext,
  ImageProfile,
  MediaMode,
  PostDraft,
  PostFormat,
  PostIntent,
  ProductImage,
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
  skipVideo?: boolean;
};

type ImageQualityPolicy = {
  imageProfile: ImageProfile;
  imageRetryAttempts: number;
  minCarouselExtras: number;
  maxCarouselExtras: number;
};

const getImageQualityPolicy = (channel: SocialChannel, requested?: ImageProfile): ImageQualityPolicy => {
  if (channel === "instagram") {
    // instagram_high_quality: prioritize visual quality over cost/time
    return {
      imageProfile: "final",
      imageRetryAttempts: 5,
      minCarouselExtras: 2,
      maxCarouselExtras: 3,
    };
  }
  return {
    imageProfile: requested ?? "preview",
    imageRetryAttempts: 3,
    minCarouselExtras: 1,
    maxCarouselExtras: 2,
  };
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
  if (channel === "tiktok") return 100;
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
  return lower.includes("/images/") && !lower.includes("ai-image-");
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

const isLogoUrl = (url: string): boolean => {
  return url.toLowerCase().includes("/logos/");
};

const filterOutLogos = (urls: string[]): string[] => {
  return urls.filter((url) => !isLogoUrl(url));
};

const pickOwnedImageUrl = async (input: GeneratePostInput): Promise<string | undefined> => {
  const storedOwned = await getOwnedImageUrls(input.userId);
  const ownedUrls = filterOutLogos(storedOwned);
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
    coreValues: input.brandContext?.coreValues,
    prohibitedTerms: input.brandContext?.prohibitedTerms,
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

  const productImages = input.brandContext?.productImages ?? [];
  if (productImages.length > 0) {
    const productResult = await tryProductImageGeneration(input, productImages);
    if (productResult) return productResult;
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

  const logoUrl = input.brandContext?.logoUrl;

  logger.info("Bildegenerering startet", {
    userId: input.userId,
    channel: input.channel,
    hasLogo: Boolean(logoUrl),
  });

  const brandRules = mergeBrandRules({
    targetAudience: input.brandContext?.targetAudience,
    brandVoice: input.brandContext?.brandVoice,
    keyMessages: input.brandContext?.keyMessages,
    coreValues: input.brandContext?.coreValues,
    prohibitedTerms: input.brandContext?.prohibitedTerms,
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

  let imageUrl = await generateProfessionalImage({
    userId: input.userId,
    prompt: imagePrompt,
    profile: getImageQualityPolicy(input.channel, input.imageProfile).imageProfile,
  });

  if (imageUrl && logoUrl) {
    const branded = await overlayLogoOnImage(imageUrl, logoUrl, input.userId);
    if (branded) {
      imageUrl = branded;
    }
  }

  return imageUrl;
};

const tryProductImageGeneration = async (
  input: GeneratePostInput,
  productImages: ProductImage[],
): Promise<string | undefined> => {
  try {
    const result = await generateProductImage({
      userId: input.userId,
      channel: input.channel,
      topic: input.topic,
      productImages,
      brandContext: input.brandContext,
      format: input.format,
    });

    if (result) {
      logger.info("Produktbilde generert med motor", {
        userId: input.userId,
        channel: input.channel,
        engine: result.engine,
        topic: input.topic,
      });
      return result.url;
    }
  } catch (error) {
    logger.warn("Produktbildegenerering feilet, faller tilbake til standard", {
      userId: input.userId,
      channel: input.channel,
      error: error instanceof Error ? error.message : "ukjent",
    });
  }
  return undefined;
};

const createImageUrlWithRetry = async (input: GeneratePostInput): Promise<string | undefined> => {
  if (input.mediaMode === "owned_only") {
    return pickOwnedImageUrl(input);
  }

  const maxAttempts = getImageQualityPolicy(input.channel, input.imageProfile).imageRetryAttempts;
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

  throw new Error(`Bildegenerering feilet etter ${maxAttempts} forsøk.`);
};

const shouldGenerateCarousel = (
  channel: SocialChannel,
  format?: PostFormat,
): boolean => {
  if (channel !== "instagram") return false;
  if (!format) return true;
  if (format === "question" || format === "opinion") return false;
  return true;
};

const CAROUSEL_ANGLE_VARIANTS = [
  "fra en annen vinkel, nærmere detaljer",
  "i bruk, kontekst og miljø rundt",
  "ovenfra-perspektiv med omgivelsene",
];

const generateCarouselImages = async (
  input: GeneratePostInput,
  primaryImagePrompt: string,
  primaryImageUrl?: string,
): Promise<string[]> => {
  const usedUrls = new Set<string>(primaryImageUrl ? [primaryImageUrl] : []);
  const policy = getImageQualityPolicy(input.channel, input.imageProfile);
  const range = Math.max(1, policy.maxCarouselExtras - policy.minCarouselExtras + 1);
  const extraCount = policy.minCarouselExtras + Math.floor(Math.random() * range);
  const urls: string[] = [];
  const logoUrl = input.brandContext?.logoUrl;

  if (input.mediaMode === "owned_only") {
    for (let i = 0; i < extraCount + 1; i += 1) {
      const owned = await pickOwnedImageUrl(input);
      if (!owned || usedUrls.has(owned)) {
        continue;
      }
      usedUrls.add(owned);
      urls.push(owned);
      if (urls.length >= extraCount) {
        break;
      }
    }
    return urls;
  }

  const generateSlide = async (i: number): Promise<string | undefined> => {
    const variant = CAROUSEL_ANGLE_VARIANTS[i % CAROUSEL_ANGLE_VARIANTS.length];
    const variantPrompt = `${primaryImagePrompt}\n\nVARIASJON: Vis dette ${variant}. Behold samme stil, fargepalett og kvalitet.`;
    try {
      let url = await generateProfessionalImage({
        userId: input.userId,
        prompt: variantPrompt,
        profile: policy.imageProfile,
      });
      if (url && logoUrl) {
        const branded = await overlayLogoOnImage(url, logoUrl, input.userId);
        if (branded) url = branded;
      }
      return url ?? undefined;
    } catch (error) {
      logger.warn("Karusellbilde generering feilet", {
        userId: input.userId,
        variant: i,
        error: error instanceof Error ? error.message : "ukjent",
      });
      return undefined;
    }
  };

  const slideResults = await Promise.allSettled(
    Array.from({ length: extraCount }, (_, i) => generateSlide(i)),
  );

  for (const result of slideResults) {
    if (result.status === "fulfilled" && result.value) {
      if (!usedUrls.has(result.value)) {
        usedUrls.add(result.value);
        urls.push(result.value);
      }
    }
  }

  if (urls.length === 0 && input.mediaMode === "hybrid") {
    for (let i = 0; i < extraCount + 1; i += 1) {
      const owned = await pickOwnedImageUrl(input);
      if (!owned || usedUrls.has(owned)) {
        continue;
      }
      usedUrls.add(owned);
      urls.push(owned);
      if (urls.length >= extraCount) {
        break;
      }
    }
  }

  return urls;
};

const buildVideoMotionPrompt = (input: GeneratePostInput): string => {
  const productName = input.brandContext?.productImages?.[0]?.productName;
  const companyName = input.brandContext?.companyName ?? "bedriften";

  if (productName) {
    return [
      `Smooth, cinematic product showcase of ${productName} by ${companyName}.`,
      "Slow camera push-in revealing product details.",
      "Subtle ambient lighting shifts. Soft depth-of-field blur in background.",
      "Professional commercial quality, steady motion, no text overlays.",
    ].join(" ");
  }

  return [
    `Professional social media video for ${companyName}.`,
    "Gentle camera movement with slow zoom or pan.",
    "Warm, inviting atmosphere with subtle light transitions.",
    "Smooth cinematic motion, high production quality, no text overlays.",
  ].join(" ");
};

const createVideoFromImage = async (
  userId: string,
  imageUrl: string,
  input: GeneratePostInput,
): Promise<string | undefined> => {
  if (!isFalAvailable()) return undefined;

  try {
    const motionPrompt = buildVideoMotionPrompt(input);
    const result = await generateImageToVideo({
      prompt: motionPrompt,
      imageUrl,
      duration: "5",
      resolution: "720p",
    });

    if (!result?.url) return undefined;

    const videoResponse = await fetch(result.url);
    if (!videoResponse.ok) return undefined;

    const videoBytes = new Uint8Array(await videoResponse.arrayBuffer());
    const uploaded = await uploadUserFile({
      userId,
      fileName: `tiktok-video-${crypto.randomUUID()}.mp4`,
      contentType: "video/mp4",
      mediaKind: "video",
      body: videoBytes,
    });

    logger.info("TikTok video generert fra bilde", {
      userId,
      channel: input.channel,
      topic: input.topic,
    });

    return uploaded.publicUrl;
  } catch (error) {
    logger.warn("TikTok videogenerering feilet", {
      userId,
      channel: input.channel,
      error: error instanceof Error ? error.message : "ukjent",
    });
    return undefined;
  }
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
  if (input.channel === "tiktok") {
    imageUrl = undefined;
  } else {
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
  }

  let additionalImageUrls: string[] | undefined;
  if (imageUrl && shouldGenerateCarousel(input.channel, input.format)) {
    const carouselBrandRules = mergeBrandRules({
      targetAudience: input.brandContext?.targetAudience,
      brandVoice: input.brandContext?.brandVoice,
      keyMessages: input.brandContext?.keyMessages,
      coreValues: input.brandContext?.coreValues,
      prohibitedTerms: input.brandContext?.prohibitedTerms,
    });
    const carouselPrompt = buildImagePrompt({
      topic: input.topic,
      channel: input.channel,
      mediaMode: input.mediaMode,
      brandRules: carouselBrandRules,
      brandContext: input.brandContext,
      imageDirection: input.imageDirection,
      format: input.format,
    });
    additionalImageUrls = await generateCarouselImages(input, carouselPrompt, imageUrl);
    if (additionalImageUrls.length > 0) {
      logger.info("Instagram karusell generert", {
        userId: input.userId,
        extraImages: additionalImageUrls.length,
        format: input.format,
      });
    }
  }

  const videoUrl: string | undefined = undefined;

  const companyName = input.brandContext?.companyName;
  const websiteUrl = input.channel === "tiktok" ? undefined : input.brandContext?.websiteUrl?.trim();
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
    additionalImageUrls: additionalImageUrls?.length ? additionalImageUrls : undefined,
    videoUrl,
    status: decision.status,
    quality: decision.quality,
    intent: input.intent,
    format: input.format,
  };
};

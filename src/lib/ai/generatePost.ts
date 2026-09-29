import { buildNorwegianCopyPrompt, type CopyVisual } from "@/lib/ai/copyPromptBuilderNo";
import { autoFixCopy, findCopyIssues } from "@/lib/ai/validateCopy";
import { mergeBrandRules } from "@/lib/ai/brandRules";
import { generateImageToVideo, isFalAvailable } from "@/lib/ai/falClient";
import { generateProfessionalImage, overlayLogoOnImage } from "@/lib/ai/imageGeneration";
import { generateProductImage } from "@/lib/ai/imageEngine";
import { buildImagePrompt } from "@/lib/ai/imagePromptBuilder";
import { composeDesignedSlide, resolveSlideLayout } from "@/lib/ai/slideComposer";
import { buildCarouselVariantPrompt, buildVisualBrief, type VisualBrief, type VisualWorld } from "@/lib/ai/visualDirection";
import { evaluatePolicy } from "@/lib/ai/policyEngine";
import type { ContentPillar, VisualMotif } from "@/lib/ai/postStrategy";
import { runRevisionLoop } from "@/lib/ai/revisionLoop";
import { findPlacePhoto, formatPhotoCredits, photoCreditRecord, type PhotoAttribution } from "@/lib/ai/placePhoto";
import {
  buildPhotoPrompt,
  buildPhotoSubject,
  composeGuideCaption,
  createSocialDesign,
  placeGuideCopy,
  resolveDesignMode,
  resolvePlaceLook,
  type SocialDesign,
} from "@/lib/ai/slideDesign";
import { downloadObjectByPublicUrl, uploadUserFile, listUserFiles } from "@/lib/cloudflare/r2";
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
  contentPillar?: ContentPillar;
  visualMotif?: VisualMotif;
  reelScript?: boolean;
  includeWebsiteLink?: boolean;
  feedIndex?: number;
  socialDesign?: SocialDesign;
  photoCredits?: PhotoAttribution[];
  placePhotoUsed?: Set<string>;
  placeLook?: string | null;
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

const fallbackText = (topic: string): string => {
  return `${topic}?\n\nHer er det verdt å se nærmere på før du bestemmer deg.\n\nHvilken ville du valgt?`;
};

const getMaxOutputTokens = (channel: SocialChannel): number => {
  if (channel === "facebook") return 520;
  if (channel === "linkedin") return 420;
  if (channel === "tiktok") return 100;
  return 280;
};

const HASHTAG_TOKEN = /#([\p{L}\p{N}_]+)/gu;

const endsWithHashtagLine = (text: string): boolean =>
  /(?:^|\n)\s*#(?:[\p{L}\p{N}_]+)(?:[ \t]+#[\p{L}\p{N}_]+)*[ \t]*$/u.test(text);

const splitHashtags = (text: string): { body: string; hashtags: string[] } => {
  const tags: string[] = [];
  const body = text.replace(HASHTAG_TOKEN, (match) => {
    if (tags.length < 3 && !tags.some((tag) => tag.toLowerCase() === match.toLowerCase())) {
      tags.push(match);
    }
    return "";
  })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { body, hashtags: tags };
};

const containsWebsiteUrl = (text: string, websiteUrl?: string): boolean => {
  if (!websiteUrl) return false;
  return text.includes(websiteUrl);
};

const withoutTrailingLink = (text: string, websiteUrl: string): string => {
  const escaped = websiteUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`\\n*${escaped}\\s*$`), "").trim();
};

export const ensureCompleteEnding = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (endsWithHashtagLine(trimmed)) return trimmed;
  if (/https?:\/\/\S+$/.test(trimmed)) return trimmed;
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
};

export const ensureWebsiteLinkInText = (
  text: string,
  websiteUrl: string | undefined,
  includeWebsiteLink: boolean,
  _pillar?: ContentPillar,
): string => {
  if (!includeWebsiteLink || !websiteUrl) return text.trim();

  const { body, hashtags } = splitHashtags(text);
  const prose = containsWebsiteUrl(body, websiteUrl)
    ? withoutTrailingLink(body, websiteUrl)
    : body;
  const complete = ensureCompleteEnding(prose);
  const withLink = complete ? `${complete}\n\n${websiteUrl}` : websiteUrl;
  return hashtags.length > 0 ? `${withLink}\n\n${hashtags.join(" ")}` : withLink;
};

export type CaptionAssembly = {
  body: string;
  link?: string;
  hashtags?: string;
  credits?: string;
};

export const assembleCaption = ({ body, link, hashtags, credits }: CaptionAssembly): string => {
  const split = splitHashtags(`${body}${hashtags?.trim() ? `\n${hashtags.trim()}` : ""}`);
  const linked = ensureWebsiteLinkInText(split.body, link?.trim(), Boolean(link?.trim()));
  const withTags = split.hashtags.length > 0 ? `${linked}\n\n${split.hashtags.join(" ")}` : linked;
  const creditLine = credits?.trim();
  return creditLine ? `${withTags}\n\n${creditLine}` : withTags;
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

const createText = async (input: GeneratePostInput, visual?: CopyVisual, world?: VisualWorld): Promise<string> => {
  const client = getOpenAiClient();
  if (!client) {
    return fallbackText(input.topic);
  }

  const brandRules = mergeBrandRules({
    targetAudience: input.brandContext?.targetAudience,
    brandVoice: input.brandContext?.brandVoice,
    keyMessages: input.brandContext?.keyMessages,
    coreValues: input.brandContext?.coreValues,
    prohibitedTerms: input.brandContext?.prohibitedTerms,
  });

  const check = { placeName: visual?.placeName, pillar: input.contentPillar };
  const ask = async (rejectionReasons?: string[]): Promise<string> => {
    const prompt = buildNorwegianCopyPrompt({
      topic: input.topic,
      channel: input.channel,
      brandRules,
      brandContext: input.brandContext,
      intent: input.intent,
      format: input.format,
      ctaType: input.ctaType,
      contentPillar: input.contentPillar,
      reelScript: input.reelScript,
      visual,
      visualWorld: world,
      rejectionReasons,
    });
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      max_output_tokens: getMaxOutputTokens(input.channel),
      input: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });
    return autoFixCopy(response.output_text || fallbackText(input.topic));
  };

  const first = await ask();
  const firstIssues = findCopyIssues(first, check);
  if (firstIssues.length === 0) return first;

  let second = first;
  try {
    second = await ask(firstIssues);
  } catch (error) {
    logger.warn("Nytt utkast feilet etter avvist posttekst", {
      topic: input.topic,
      channel: input.channel,
      error: error instanceof Error ? error.message : "ukjent",
      issues: firstIssues,
    });
    return first;
  }

  const secondIssues = findCopyIssues(second, check);
  if (secondIssues.length === 0) return second;

  logger.warn("Posttekst avvist to ganger, bruker beste utkast", {
    topic: input.topic,
    channel: input.channel,
    firstIssues,
    secondIssues,
  });
  return secondIssues.length < firstIssues.length ? second : first;
};

const publicFileUrl = (url: string): string => {
  const publicBase = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (!publicBase || url.startsWith(publicBase)) return url;
  const match = url.match(/\/users\/.+$/);
  return match ? `${publicBase}${match[0]}` : url;
};

const loadBuffer = async (url?: string): Promise<Buffer | undefined> => {
  if (!url) return undefined;
  const target = publicFileUrl(url);
  try {
    const response = await fetch(target);
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    logger.warn("Kunne ikke hente fil via URL", { status: response.status });
  } catch (error) {
    logger.warn("Kunne ikke hente fil via URL", {
      error: error instanceof Error ? error.message : "ukjent",
    });
  }

  try {
    return await downloadObjectByPublicUrl(target);
  } catch (error) {
    logger.warn("Kunne ikke hente fil fra lagring", {
      error: error instanceof Error ? error.message : "ukjent",
    });
    return undefined;
  }
};

const renderDesignedSlide = async (
  input: GeneratePostInput,
  design: SocialDesign,
  brief: VisualBrief,
  slideIndex: number,
): Promise<string | undefined> => {
  const onPhoto = design.mode === "guide" || Boolean(brief.placeName) || brief.world === "travel";
  const layout = resolveSlideLayout(input.channel, design.mode, slideIndex, onPhoto);
  let photo: Buffer | undefined;
  let attribution: PhotoAttribution | undefined;
  if (brief.placeName) {
    const subject = slideIndex > 0 ? design.cards[slideIndex - 1]?.title : undefined;
    const found = await findPlacePhoto(brief.placeName, subject, input.placePhotoUsed ?? new Set());
    if (!found) {
      logger.warn("Fant ikke ekte foto av stedet", {
        place: brief.placeName,
        subject,
      });
      return undefined;
    }
    photo = found.bytes;
    attribution = found.attribution;
  } else if (brief.world === "travel") {
    logger.warn("Reiseinnlegg uten stedsnavn, hopper over oppdiktet bilde", {
      topic: input.topic,
    });
    return undefined;
  } else {
    const photoUrl = await generateProfessionalImage({
      userId: input.userId,
      prompt: buildPhotoPrompt(
        design,
        brief,
        slideIndex,
        layout === "single" ? "single" : "slide",
        input.placeLook,
      ),
      profile: getImageQualityPolicy(input.channel, input.imageProfile).imageProfile,
      size: "1024x1536",
    });
    if (!photoUrl) return undefined;
    photo = await loadBuffer(photoUrl);
  }
  if (!photo) return undefined;
  const logoUrl = input.brandContext?.logoUrl;
  const logo = await loadBuffer(logoUrl);
  if (logoUrl && !logo) {
    logger.warn("Logo ble ikke lagt på bildet", { userId: input.userId, slideIndex });
  }
  const jpeg = await composeDesignedSlide({
    photo,
    design,
    slideIndex,
    layout,
    logo,
    primaryColor: input.brandContext?.brandColors?.primary,
    secondaryColor: input.brandContext?.brandColors?.secondary,
    accentColor: input.brandContext?.brandColors?.accent,
  });
  const uploaded = await uploadUserFile({
    userId: input.userId,
    fileName: `ai-slide-${crypto.randomUUID()}.jpg`,
    contentType: "image/jpeg",
    mediaKind: "image",
    body: new Uint8Array(jpeg),
  });
  if (attribution && input.photoCredits && !input.photoCredits.some((item) => photoCreditRecord(item) === photoCreditRecord(attribution))) {
    input.photoCredits.push(attribution);
  }
  return uploaded.publicUrl;
};

const createImageUrl = async (input: GeneratePostInput): Promise<string | undefined> => {
  if (input.mediaMode === "owned_only") {
    return pickOwnedImageUrl(input);
  }

  if (input.socialDesign) {
    const brief = buildVisualBrief({
      topic: input.topic,
      brandContext: input.brandContext,
      format: input.format,
      motif: input.visualMotif,
      feedIndex: input.feedIndex,
    });
    return renderDesignedSlide(input, input.socialDesign, brief, 0);
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
    visualMotif: input.visualMotif,
    feedIndex: input.feedIndex,
    reelScript: input.reelScript,
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
  reelScript?: boolean,
): boolean => {
  if (reelScript) return false;
  if (channel !== "instagram") return false;
  if (!format) return true;
  if (format === "question" || format === "opinion") return false;
  return true;
};

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

  const visualBrief = buildVisualBrief({
    topic: input.topic,
    brandContext: input.brandContext,
    format: input.format,
  });

  const generateSlide = async (i: number): Promise<string | undefined> => {
    const variantPrompt = buildCarouselVariantPrompt(primaryImagePrompt, visualBrief, i);
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

const generateDesignedSlides = async (
  input: GeneratePostInput,
  design: SocialDesign,
  primaryImageUrl?: string,
): Promise<string[]> => {
  const brief = buildVisualBrief({
    topic: input.topic,
    brandContext: input.brandContext,
    format: input.format,
    motif: input.visualMotif,
    feedIndex: input.feedIndex,
  });
  const used = new Set<string>(primaryImageUrl ? [primaryImageUrl] : []);
  const urls: string[] = [];

  for (let slideIndex = 1; slideIndex <= design.cards.length; slideIndex += 1) {
    try {
      const url = await renderDesignedSlide(input, design, brief, slideIndex);
      if (url && !used.has(url)) {
        used.add(url);
        urls.push(url);
      }
    } catch (error) {
      logger.warn("Designslide feilet", {
        userId: input.userId,
        slideIndex,
        error: error instanceof Error ? error.message : "ukjent",
      });
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

const buildCopyVisual = (
  brief: VisualBrief,
  design: SocialDesign,
): CopyVisual => ({
  placeName: brief.placeName,
  scene: buildPhotoSubject(design, brief, 0),
  overlayTitle: design.coverTitle,
  overlaySubline: design.coverSubline,
});

export const generatePost = async (input: GeneratePostInput): Promise<PostDraft> => {
  const brief = buildVisualBrief({
    topic: input.topic,
    brandContext: input.brandContext,
    format: input.format,
    motif: input.visualMotif,
    feedIndex: input.feedIndex,
  });
  const placeLookPromise = resolvePlaceLook(brief.placeName);

  let socialDesign: SocialDesign | undefined;
  if (input.channel !== "tiktok" && input.mediaMode !== "owned_only") {
    const mode = resolveDesignMode(input.contentPillar, input.visualMotif);
    socialDesign = await createSocialDesign({
      topic: input.topic,
      channel: input.channel,
      brandContext: input.brandContext,
      contentPillar: input.contentPillar,
      visualMotif: input.visualMotif,
      brief,
      forceGuide: mode === "guide",
    });
    if (brief.placeName && socialDesign.mode === "guide") {
      socialDesign = placeGuideCopy(socialDesign, brief.placeName);
    }
  }

  const imageInput: GeneratePostInput = {
    ...input,
    socialDesign,
    photoCredits: [],
    placePhotoUsed: new Set<string>(),
    placeLook: await placeLookPromise,
  };

  let imageUrl: string | undefined;
  if (input.channel === "tiktok") {
    imageUrl = undefined;
  } else {
    try {
      imageUrl = await createImageUrlWithRetry(imageInput);
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
  if (imageUrl && socialDesign?.mode === "guide" && input.channel !== "tiktok") {
    additionalImageUrls = await generateDesignedSlides(imageInput, socialDesign, imageUrl);
  } else if (imageUrl && input.mediaMode === "owned_only" && shouldGenerateCarousel(input.channel, input.format, input.reelScript)) {
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
      visualMotif: input.visualMotif,
      feedIndex: input.feedIndex,
      reelScript: false,
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

  let rawText = fallbackText(input.topic);
  if (socialDesign?.mode === "guide") {
    const link = input.includeWebsiteLink && input.channel !== "tiktok"
      ? input.brandContext?.websiteUrl?.trim()
      : undefined;
    rawText = composeGuideCaption(socialDesign, link);
  } else {
    const visual = socialDesign
      ? buildCopyVisual(brief, socialDesign)
      : brief.placeName
        ? {
            placeName: brief.placeName,
            scene: brief.subjectDirection,
            overlayTitle: brief.placeName,
            overlaySubline: "",
          }
        : undefined;
    try {
      rawText = await createText(input, visual, brief.world);
    } catch (error) {
      logger.warn("AI text generation failed, using fallback text", {
        userId: input.userId,
        channel: input.channel,
        topic: input.topic,
        error: error instanceof Error ? error.message : "unknown",
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
  const creditedText = assembleCaption({
    body: revision.finalText,
    link: input.includeWebsiteLink ? websiteUrl : undefined,
    credits: formatPhotoCredits(imageInput.photoCredits ?? []) || undefined,
  });
  const decision = evaluatePolicy({
    text: creditedText,
    imageUrl,
    companyName,
  });

  return {
    id: crypto.randomUUID(),
    channel: input.channel,
    scheduledAt: input.scheduledAt,
    text: creditedText,
    imageUrl,
    additionalImageUrls: additionalImageUrls?.length ? additionalImageUrls : undefined,
    imageCredit: imageInput.photoCredits?.[0] ? photoCreditRecord(imageInput.photoCredits[0]) : undefined,
    additionalImageCredits: imageInput.photoCredits?.slice(1).map(photoCreditRecord),
    videoUrl,
    status: decision.status,
    quality: decision.quality,
    intent: input.intent,
    format: input.format,
  };
};

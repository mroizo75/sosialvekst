import { buildNorwegianCopyPrompt, type CopyVisual } from "@/lib/ai/copyPromptBuilderNo";
import { autoFixCopy, findCopyIssues } from "@/lib/ai/validateCopy";
import { mergeBrandRules } from "@/lib/ai/brandRules";
import { generateImageToVideo, isFalAvailable } from "@/lib/ai/falClient";
import { describeMediaUrl, generateProfessionalImage, overlayLogoOnImage } from "@/lib/ai/imageGeneration";
import { generateProductImage } from "@/lib/ai/imageEngine";
import { buildImagePrompt } from "@/lib/ai/imagePromptBuilder";
import { resolveCopyModel } from "@/lib/ai/models";
import { composeDesignedSlide, type SlideLayout, type SlideShape } from "@/lib/ai/slideComposer";
import { buildCarouselVariantPrompt, buildVisualBrief, type VisualBrief, type VisualWorld } from "@/lib/ai/visualDirection";
import { evaluatePolicy } from "@/lib/ai/policyEngine";
import type { ContentPillar, VisualMotif } from "@/lib/ai/postStrategy";
import { runRevisionLoop } from "@/lib/ai/revisionLoop";
import { findPlacePhoto, photoCreditRecord, type PhotoAttribution } from "@/lib/ai/placePhoto";
import {
  buildPhotoPrompt,
  buildPhotoSubject,
  composeGuideCaption,
  createSocialDesign,
  placeGuideCopy,
  resolvePlaceLook,
  type SocialDesign,
} from "@/lib/ai/slideDesign";
import { downloadObjectByPublicUrl, uploadUserFile, listUserFiles } from "@/lib/cloudflare/r2";
import { logger } from "@/lib/logger";
import { getOpenAiClient } from "@/lib/openai";
import type {
  BrandContext,
  GenerationStep,
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
  avoidRepeating?: string[];
  textOnlyForImageUrl?: string;
  socialDesign?: SocialDesign;
  visualBrief?: VisualBrief;
  logoBytes?: Promise<Buffer | undefined>;
  placePhotoUsed?: Set<string>;
  placeLook?: string | null;
  trace?: GenerationStep[];
};

export const appVersion = (): string =>
  process.env.APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "ukjent";

const note = (input: GeneratePostInput, step: string, ok: boolean, detail?: string): void => {
  input.trace?.push({ step, ok, ...(detail ? { detail } : {}) });
};

const errorText = (error: unknown): string => (error instanceof Error ? error.message : "ukjent feil");

type SlideImage = {
  url: string;
  attribution?: PhotoAttribution;
};

type SlidePhoto = {
  bytes?: Buffer;
  attribution?: PhotoAttribution;
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
  if (channel === "facebook") return 700;
  if (channel === "linkedin") return 520;
  if (channel === "tiktok") return 120;
  return 520;
};

const HASHTAG_TOKEN = /#([\p{L}\p{N}_]+)/gu;
const BARE_TAG = /^[\p{Ll}\p{N}_]{4,40}$/u;

const endsWithHashtagLine = (text: string): boolean =>
  /(?:^|\n)\s*#(?:[\p{L}\p{N}_]+)(?:[ \t]+#[\p{L}\p{N}_]+)*[ \t]*$/u.test(text)
  || BARE_TAG.test(text.trim().split("\n").at(-1)?.trim().replace(/[.,!?;:]+$/u, "") ?? "");

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

const peelBareHashtagLines = (text: string): { body: string; hashtags: string[] } => {
  const lines = text.split("\n");
  const tags: string[] = [];
  while (tags.length < 3 && lines.length > 0) {
    const raw = lines[lines.length - 1]?.trim() ?? "";
    if (!raw) {
      lines.pop();
      continue;
    }
    const token = raw.replace(/[.,!?;:]+$/u, "");
    if (raw.includes(" ") || !BARE_TAG.test(token)) break;
    lines.pop();
    tags.unshift(`#${token}`);
  }
  return { body: lines.join("\n").trim(), hashtags: tags };
};

const stripStandaloneUrl = (text: string, websiteUrl: string): string => {
  const target = websiteUrl.trim().replace(/\/$/, "");
  return text
    .split("\n")
    .filter((line) => {
      const value = line.trim().replace(/\/$/, "");
      return value !== target && value !== websiteUrl.trim();
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const ensureCompleteEnding = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (endsWithHashtagLine(trimmed)) return trimmed;
  if (/https?:\/\/\S+$/.test(trimmed)) return trimmed;
  const normalized = trimmed.replace(/:+(?=\s*[.!?]?$)/u, "").trim();
  if (/[.!?]$/.test(normalized)) return normalized;
  return `${normalized}.`;
};

export const ensureWebsiteLinkInText = (
  text: string,
  websiteUrl: string | undefined,
  includeWebsiteLink: boolean,
  _pillar?: ContentPillar,
): string => {
  const hashed = splitHashtags(text);
  const bare = peelBareHashtagLines(hashed.body);
  const tags = [...hashed.hashtags, ...bare.hashtags].slice(0, 3);
  const prose = websiteUrl ? stripStandaloneUrl(bare.body, websiteUrl) : bare.body;
  const complete = ensureCompleteEnding(prose);
  const withLink = includeWebsiteLink && websiteUrl && !containsWebsiteUrl(complete, websiteUrl)
    ? (complete ? `${complete}\n\n${websiteUrl}` : websiteUrl)
    : complete;
  return tags.length > 0 ? `${withLink}\n\n${tags.join(" ")}` : withLink;
};

export type CaptionAssembly = {
  body: string;
  link?: string;
  hashtags?: string;
  credits?: string;
};

const CREDIT_PREFIX = /^(?:foto|bilde|photo)\s*:\s*/i;

const isCreditLine = (line: string): boolean => CREDIT_PREFIX.test(line.trim());

export const creditLineFromRecords = (records: Array<string | null | undefined>): string => {
  const items = [...new Set(
    records
      .map((record) => record?.trim().replace(CREDIT_PREFIX, "").trim() ?? "")
      .filter(Boolean),
  )];
  return items.length > 0 ? `Foto: ${items.join(" · ")}` : "";
};

export const creditRecordsFromText = (text: string): string[] =>
  text.split("\n").map((line) => line.trim()).filter(isCreditLine);

export const stripCreditLines = (text: string): string =>
  text
    .split("\n")
    .filter((line) => !isCreditLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const replaceCreditLine = (text: string, records: Array<string | null | undefined>): string => {
  const body = stripCreditLines(text);
  const creditLine = creditLineFromRecords(records);
  return creditLine ? `${body}\n\n${creditLine}` : body;
};

export const slideShapeFor = (channel: SocialChannel): SlideShape =>
  channel === "instagram" ? "square" : "portrait";

export const assembleCaption = ({ body, link, hashtags, credits }: CaptionAssembly): string => {
  const combined = `${body}${hashtags?.trim() ? `\n${hashtags.trim()}` : ""}`;
  const linked = ensureWebsiteLinkInText(combined, link?.trim(), Boolean(link?.trim()));
  const creditLine = credits?.trim();
  if (!creditLine || linked.includes(creditLine)) return linked;
  return `${linked}\n\n${creditLine}`;
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

const brandRulesFor = (input: GeneratePostInput) => mergeBrandRules({
  targetAudience: input.brandContext?.targetAudience,
  brandVoice: input.brandContext?.brandVoice,
  keyMessages: input.brandContext?.keyMessages,
  coreValues: input.brandContext?.coreValues,
  prohibitedTerms: input.brandContext?.prohibitedTerms,
});

const profileTermsFor = (input: GeneratePostInput, placeName?: string | null): string[] =>
  [
    ...(input.brandContext?.products ?? []),
    ...(input.brandContext?.services ?? []),
    placeName ?? "",
  ].filter((term) => term.trim().length >= 3);

export const postStatusForMedia = (
  channel: SocialChannel,
  imageUrl: string | undefined,
  videoUrl: string | undefined,
  status: "draft" | "needs_review",
): "draft" | "needs_review" => {
  if (channel === "tiktok" && !imageUrl && !videoUrl) return "needs_review";
  return status;
};

export { resolveCopyModel };

export const buildCopyUserInput = (text: string, imageUrl?: string) => {
  if (!imageUrl) return text;
  return [
    {
      type: "input_text" as const,
      text: `${text}\n\nDette er bildet som publiseres. Teksten skal passe det du ser.`,
    },
    { type: "input_image" as const, image_url: imageUrl, detail: "auto" as const },
  ];
};

const createText = async (
  input: GeneratePostInput,
  fallback: string,
  visual?: CopyVisual,
  world?: VisualWorld,
  imageUrl?: string,
): Promise<string> => {
  const client = getOpenAiClient();
  if (!client) {
    return fallback;
  }

  const brandRules = brandRulesFor(input);

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
      avoidRepeating: input.avoidRepeating,
    });
    const response = await client.responses.create({
      model: resolveCopyModel(),
      max_output_tokens: getMaxOutputTokens(input.channel),
      input: [
        { role: "system", content: prompt.system },
        { role: "user", content: buildCopyUserInput(prompt.user, imageUrl) },
      ],
    });
    return autoFixCopy(response.output_text || fallback);
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

const applyBrandLogo = async (
  imageUrl: string | undefined,
  input: GeneratePostInput,
  stage: string,
): Promise<string | undefined> => {
  if (!imageUrl) return undefined;
  const logoUrl = input.brandContext?.logoUrl;
  const ref = describeMediaUrl(logoUrl);
  if (!logoUrl) {
    logger.warn("Logo hoppet over", {
      stage,
      userId: input.userId,
      reason: "ingen logoUrl",
    });
    return imageUrl;
  }

  const branded = await overlayLogoOnImage(imageUrl, logoUrl, input.userId);
  if (!branded) {
    logger.warn("Logo ble ikke lagt på", {
      stage,
      userId: input.userId,
      reason: "overlay feilet",
      ...ref,
    });
    return imageUrl;
  }

  logger.info("Logo lagt på", { stage, userId: input.userId, ...ref });
  return branded;
};

const loadBuffer = async (url: string | undefined, purpose: string): Promise<Buffer | undefined> => {
  if (!url) return undefined;
  const target = publicFileUrl(url);
  const ref = describeMediaUrl(target);
  try {
    const response = await fetch(target);
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      logger.info("Fil hentet", {
        purpose,
        bytes: buffer.byteLength,
        contentType: response.headers.get("content-type"),
        ...ref,
      });
      return buffer;
    }
    logger.warn("Kunne ikke hente fil via URL", { purpose, status: response.status, ...ref });
  } catch (error) {
    logger.warn("Kunne ikke hente fil via URL", {
      purpose,
      error: error instanceof Error ? error.message : "ukjent",
      ...ref,
    });
  }

  try {
    const stored = await downloadObjectByPublicUrl(target);
    if (!stored) {
      logger.warn("Kunne ikke hente fil fra lagring", { purpose, reason: "tom", ...ref });
    }
    return stored;
  } catch (error) {
    logger.warn("Kunne ikke hente fil fra lagring", {
      purpose,
      error: error instanceof Error ? error.message : "ukjent",
      ...ref,
    });
    return undefined;
  }
};

const findSlidePhoto = async (
  input: GeneratePostInput,
  design: SocialDesign,
  brief: VisualBrief,
  slideIndex: number,
): Promise<SlidePhoto> => {
  const step = `slide${slideIndex}.foto`;
  if (brief.placeName) {
    const subject = slideIndex > 0 ? design.cards[slideIndex - 1]?.title : undefined;
    const found = await findPlacePhoto(brief.placeName, subject, input.placePhotoUsed ?? new Set());
    if (found) {
      note(input, step, true, `ekte foto av ${brief.placeName} (${found.credit})`);
      return { bytes: found.bytes, attribution: found.attribution };
    }
    note(input, step, false, `fant ikke ekte foto av ${brief.placeName}${subject ? ` / ${subject}` : ""}, bruker AI-foto`);
    logger.warn("Fant ikke ekte foto av stedet, bruker AI-foto", { place: brief.placeName, subject });
  }
  const productImages = input.brandContext?.productImages ?? [];
  if (slideIndex === 0 && productImages.length > 0) {
    const productUrl = await tryProductImageGeneration(input, productImages);
    const productBytes = await loadBuffer(productUrl, "produktfoto");
    if (productBytes) {
      note(input, step, true, "produktbilde");
      return { bytes: productBytes };
    }
  }
  try {
    const photoUrl = await generateProfessionalImage({
      userId: input.userId,
      prompt: buildPhotoPrompt(design, brief, slideIndex, input.placeLook, input.brandContext?.industry),
      profile: getImageQualityPolicy(input.channel, input.imageProfile).imageProfile,
      size: slideShapeFor(input.channel) === "square" ? "1024x1024" : "1024x1536",
    });
    const bytes = await loadBuffer(photoUrl, "slidefoto");
    note(input, step, Boolean(bytes), bytes ? "AI-foto" : "AI-foto kunne ikke hentes");
    return { bytes };
  } catch (error) {
    note(input, step, false, `AI-foto feilet: ${errorText(error)}`);
    if (slideIndex === 0) throw error;
    logger.warn("Slidefoto feilet, bruker fargekort", {
      userId: input.userId,
      slideIndex,
      error: errorText(error),
    });
    return {};
  }
};

const composeAndUpload = async (
  input: GeneratePostInput,
  design: SocialDesign,
  slideIndex: number,
  layout: SlideLayout,
  photo: SlidePhoto = {},
): Promise<SlideImage> => {
  const logo = await (input.logoBytes ?? loadBuffer(input.brandContext?.logoUrl, "logo"));
  const slide = {
    photo: photo.bytes,
    design,
    slideIndex,
    layout,
    shape: slideShapeFor(input.channel),
    carousel: design.mode === "guide" && design.cards.length > 0,
    companyName: input.brandContext?.companyName,
    websiteUrl: input.brandContext?.websiteUrl,
    credit: photo.attribution ? photoCreditRecord(photo.attribution) : undefined,
    primaryColor: input.brandContext?.brandColors?.primary,
    secondaryColor: input.brandContext?.brandColors?.secondary,
    accentColor: input.brandContext?.brandColors?.accent,
  };
  const step = `slide${slideIndex}.${layout}`;
  let jpeg: Buffer;
  try {
    jpeg = await composeDesignedSlide({ ...slide, logo });
    note(input, step, true, logo ? `${slide.shape}, med logo` : `${slide.shape}, UTEN logo (logo ikke hentet)`);
  } catch (error) {
    note(input, step, false, `komposisjon feilet: ${errorText(error)}`);
    if (!logo) throw error;
    logger.warn("Komposisjon med logo feilet, prøver uten logo", {
      userId: input.userId,
      slideIndex,
      logoBytes: logo.byteLength,
      error: errorText(error),
    });
    jpeg = await composeDesignedSlide(slide);
    note(input, step, true, `${slide.shape}, UTEN logo (logo feilet)`);
  }
  const uploaded = await uploadUserFile({
    userId: input.userId,
    fileName: `ai-slide-${crypto.randomUUID()}.jpg`,
    contentType: "image/jpeg",
    mediaKind: "image",
    body: new Uint8Array(jpeg),
  });
  return { url: uploaded.publicUrl, attribution: photo.attribution };
};

const renderDesignedSlide = async (
  input: GeneratePostInput,
  design: SocialDesign,
  brief: VisualBrief,
  slideIndex: number,
): Promise<SlideImage | undefined> => {
  const photo = await findSlidePhoto(input, design, brief, slideIndex);
  if (slideIndex === 0 && !photo.bytes) return undefined;
  const layout: SlideLayout = slideIndex === 0 ? "cover" : photo.bytes ? "slide" : "card";
  return composeAndUpload(input, design, slideIndex, layout, photo);
};

const asSlideImage = (url: string | undefined): SlideImage | undefined =>
  url ? { url } : undefined;

const createImageUrl = async (input: GeneratePostInput): Promise<SlideImage | undefined> => {
  if (input.mediaMode === "owned_only") {
    return asSlideImage(await applyBrandLogo(await pickOwnedImageUrl(input), input, "owned_only"));
  }

  if (input.socialDesign) {
    const brief = input.visualBrief ?? buildVisualBrief({
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
    if (productResult) return asSlideImage(await applyBrandLogo(productResult, input, "product"));
  }

  if (input.mediaMode === "hybrid") {
    const ownedImageUrl = await pickOwnedImageUrl(input);
    if (ownedImageUrl) {
      const shouldUseOwned = shouldUseOwnedInHybrid(input.userId);
      if (shouldUseOwned) {
        return asSlideImage(await applyBrandLogo(ownedImageUrl, input, "hybrid_owned"));
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

  const imageUrl = await generateProfessionalImage({
    userId: input.userId,
    prompt: imagePrompt,
    profile: getImageQualityPolicy(input.channel, input.imageProfile).imageProfile,
  });

  return asSlideImage(await applyBrandLogo(imageUrl, input, "generated"));
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

const createImageUrlWithRetry = async (input: GeneratePostInput): Promise<SlideImage | undefined> => {
  if (input.mediaMode === "owned_only") {
    return asSlideImage(await applyBrandLogo(await pickOwnedImageUrl(input), input, "owned_only"));
  }

  const maxAttempts = getOpenAiClient()
    ? getImageQualityPolicy(input.channel, input.imageProfile).imageRetryAttempts
    : 1;
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
      note(input, `forside.forsøk${attempt}`, false, errorText(error));
      logger.warn("AI image generation attempt failed", {
        userId: input.userId,
        channel: input.channel,
        topic: input.topic,
        attempt,
        error: errorText(error),
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

  if (input.mediaMode === "owned_only") {
    for (let i = 0; i < extraCount + 1; i += 1) {
      const owned = await pickOwnedImageUrl(input);
      if (!owned || usedUrls.has(owned)) {
        continue;
      }
      const branded = await applyBrandLogo(owned, input, "carousel_owned");
      if (!branded) continue;
      usedUrls.add(owned);
      urls.push(branded);
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
      const url = await generateProfessionalImage({
        userId: input.userId,
        prompt: variantPrompt,
        profile: policy.imageProfile,
      });
      return applyBrandLogo(url, input, `carousel-${i}`);
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
      const branded = await applyBrandLogo(owned, input, "carousel_hybrid_owned");
      if (!branded) continue;
      usedUrls.add(owned);
      urls.push(branded);
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
  brief: VisualBrief,
): Promise<SlideImage[]> => {
  const renderSafely = async (slideIndex: number): Promise<SlideImage | undefined> => {
    try {
      return await renderDesignedSlide(input, design, brief, slideIndex);
    } catch (error) {
      logger.warn("Designslide feilet", {
        userId: input.userId,
        slideIndex,
        error: error instanceof Error ? error.message : "ukjent",
      });
      return undefined;
    }
  };

  const indices = design.cards.map((_, index) => index + 1);
  const slides: Array<SlideImage | undefined> = [];
  if (brief.placeName) {
    for (const slideIndex of indices) {
      slides.push(await renderSafely(slideIndex));
    }
  } else {
    slides.push(...await Promise.all(indices.map(renderSafely)));
  }

  try {
    slides.push(await composeAndUpload(input, design, indices.length + 1, "cta"));
  } catch (error) {
    logger.warn("Avslutningsslide feilet", {
      userId: input.userId,
      error: error instanceof Error ? error.message : "ukjent",
    });
  }

  return slides.filter((slide): slide is SlideImage => slide !== undefined);
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
  slides: design.cards.map((card) => ({ title: card.title, summary: card.summary })),
});

const uniqueAttributions = (slides: Array<SlideImage | undefined>): PhotoAttribution[] => {
  const seen = new Set<string>();
  return slides
    .map((slide) => slide?.attribution)
    .filter((item): item is PhotoAttribution => {
      if (!item) return false;
      const key = photoCreditRecord(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const generatePost = async (input: GeneratePostInput): Promise<PostDraft> => {
  const logoRef = describeMediaUrl(input.brandContext?.logoUrl);
  const trace: GenerationStep[] = [];
  const tracked: GeneratePostInput = { ...input, trace };
  logger.info("Postgenerering startet", {
    version: appVersion(),
    userId: input.userId,
    channel: input.channel,
    mediaMode: input.mediaMode,
    format: input.format ?? null,
    topic: input.topic,
    ...logoRef,
  });

  const brief = buildVisualBrief({
    topic: input.topic,
    brandContext: input.brandContext,
    format: input.format,
    motif: input.visualMotif,
    feedIndex: input.feedIndex,
  });
  const placeLookPromise = resolvePlaceLook(brief.placeName);

  const textOnly = input.textOnlyForImageUrl !== undefined;
  let socialDesign: SocialDesign | undefined;
  if (!textOnly && input.channel !== "tiktok" && input.mediaMode !== "owned_only") {
    socialDesign = await createSocialDesign({
      topic: input.topic,
      channel: input.channel,
      brandContext: input.brandContext,
      contentPillar: input.contentPillar,
      visualMotif: input.visualMotif,
      brief,
      avoidRepeating: input.avoidRepeating,
    });
    if (brief.placeName) {
      socialDesign = placeGuideCopy(socialDesign, brief.placeName);
    }
    note(tracked, "design", true, `${socialDesign.mode}, ${socialDesign.cards.length} slides, forside «${socialDesign.coverTitle}»${brief.placeName ? `, sted ${brief.placeName}` : ""}`);
  } else {
    note(tracked, "design", false, textOnly ? "kun tekst, beholder bildet" : `ingen design for ${input.channel}/${input.mediaMode}`);
  }

  const logoBytes = loadBuffer(input.brandContext?.logoUrl, "logo");
  const imageInput: GeneratePostInput = {
    ...tracked,
    socialDesign,
    visualBrief: brief,
    logoBytes,
    placePhotoUsed: new Set<string>(),
    placeLook: await placeLookPromise,
  };
  if (socialDesign) {
    const logo = await logoBytes;
    note(tracked, "logo", Boolean(logo), logo ? `${logo.byteLength} bytes` : input.brandContext?.logoUrl ? "logoUrl finnes, men filen kunne ikke hentes" : "ingen logo i merkevareprofilen");
  }

  let primary: SlideImage | undefined = textOnly ? asSlideImage(input.textOnlyForImageUrl) : undefined;
  if (!textOnly && input.channel !== "tiktok") {
    try {
      primary = await createImageUrlWithRetry(imageInput);
      note(tracked, "forside", true, primary?.url.split("/").pop());
    } catch (error) {
      note(tracked, "forside", false, errorText(error));
      logger.warn("AI image generation failed, continuing without image", {
        userId: input.userId,
        channel: input.channel,
        topic: input.topic,
        error: errorText(error),
      });
    }
  }
  const imageUrl = primary?.url;

  let extraSlides: SlideImage[] = [];
  if (imageUrl && socialDesign?.mode === "guide" && socialDesign.cards.length > 0) {
    extraSlides = await generateDesignedSlides(imageInput, socialDesign, brief);
    logger.info("Karusell generert", {
      userId: input.userId,
      channel: input.channel,
      extraImages: extraSlides.length,
    });
  }

  let additionalImageUrls: string[] | undefined = extraSlides.length > 0
    ? extraSlides.map((slide) => slide.url)
    : undefined;
  if (!textOnly && !additionalImageUrls && imageUrl && input.mediaMode === "owned_only" && shouldGenerateCarousel(input.channel, input.format, input.reelScript)) {
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

  const fallbackCaption = socialDesign?.mode === "guide" && socialDesign.cards.length > 0
    ? composeGuideCaption(socialDesign)
    : fallbackText(input.topic);
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
  let rawText = fallbackCaption;
  try {
    rawText = await createText(input, fallbackCaption, visual, brief.world, imageUrl);
    note(tracked, "tekst", rawText !== fallbackCaption, rawText !== fallbackCaption ? `${rawText.length} tegn` : "reservetekst brukt");
  } catch (error) {
    note(tracked, "tekst", false, `reservetekst brukt: ${errorText(error)}`);
    logger.warn("AI text generation failed, using fallback text", {
      userId: input.userId,
      channel: input.channel,
      topic: input.topic,
      error: errorText(error),
    });
  }

  const videoUrl: string | undefined = undefined;
  const missingTikTokMedia = input.channel === "tiktok" && !imageUrl && !videoUrl;
  if (missingTikTokMedia) {
    logger.warn("TikTok-innlegg mangler både bilde og video", {
      userId: input.userId,
      topic: input.topic,
    });
  }

  const companyName = input.brandContext?.companyName;
  const websiteUrl = input.channel === "tiktok" ? undefined : input.brandContext?.websiteUrl?.trim();
  const brandRules = brandRulesFor(input);
  const profileTerms = profileTermsFor(input, brief.placeName);
  const revision = runRevisionLoop({
    initialText: stripCreditLines(rawText),
    imageUrl,
    companyName,
    brandRules,
    profileTerms,
    pillar: input.contentPillar,
    placeName: brief.placeName,
    maxAttempts: 2,
  });
  const credits = creditLineFromRecords(uniqueAttributions([primary, ...extraSlides]).map(photoCreditRecord));
  const creditedText = assembleCaption({
    body: revision.finalText,
    link: input.includeWebsiteLink ? websiteUrl : undefined,
    credits: credits || undefined,
  });
  const decision = evaluatePolicy({
    text: creditedText,
    imageUrl,
    companyName,
    brandRules,
    profileTerms,
    pillar: input.contentPillar,
    placeName: brief.placeName,
  });

  note(tracked, "kreditt", true, credits || "ingen fotokreditt (ingen ekte foto brukt)");
  logger.info("Genereringsrapport", {
    version: appVersion(),
    userId: input.userId,
    channel: input.channel,
    topic: input.topic,
    hasImage: Boolean(imageUrl),
    extraImages: additionalImageUrls?.length ?? 0,
    failedSteps: trace.filter((item) => !item.ok).length,
    steps: trace,
    ...logoRef,
  });

  return {
    id: crypto.randomUUID(),
    channel: input.channel,
    scheduledAt: input.scheduledAt,
    text: creditedText,
    imageUrl,
    additionalImageUrls: additionalImageUrls?.length ? additionalImageUrls : undefined,
    imageCredit: primary?.attribution ? photoCreditRecord(primary.attribution) : undefined,
    additionalImageCredits: extraSlides.length > 0
      ? extraSlides.map((slide) => (slide.attribution ? photoCreditRecord(slide.attribution) : ""))
      : undefined,
    videoUrl,
    status: postStatusForMedia(input.channel, imageUrl, videoUrl, decision.status),
    quality: decision.quality,
    intent: input.intent,
    format: input.format,
    generationTrace: trace,
  };
};

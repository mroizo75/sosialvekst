import type { ContentPillar, VisualMotif } from "@/lib/ai/postStrategy";
import type { VisualBrief } from "@/lib/ai/visualDirection";
import { logger } from "@/lib/logger";
import { getOpenAiClient } from "@/lib/openai";
import type { BrandContext, SocialChannel } from "@/lib/types";

export type GuideCard = {
  title: string;
  summary: string;
  bullets: string[];
};

export type SocialDesign = {
  mode: "guide" | "headline";
  coverTitle: string;
  coverSubline: string;
  question: string;
  cards: GuideCard[];
  cta: string;
};

type DesignInput = {
  topic: string;
  channel: SocialChannel;
  brandContext?: BrandContext;
  contentPillar?: ContentPillar;
  visualMotif?: VisualMotif;
  brief: VisualBrief;
  forceGuide?: boolean;
};

const clampWords = (value: string, maxWords: number, maxChars: number): string => {
  const cleaned = value.replace(/\s+/g, " ").replace(/[«»"]/g, "").trim();
  const words = cleaned.split(" ").filter(Boolean).slice(0, maxWords).join(" ");
  return words.length <= maxChars ? words : words.slice(0, maxChars).trim();
};

export const resolveDesignMode = (
  pillar?: ContentPillar,
  motif?: VisualMotif,
): "guide" | "headline" => {
  if (pillar === "useful" || pillar === "commercial") return "guide";
  if (motif === "guide" || motif === "comparison" || motif === "price") return "guide";
  return "headline";
};

const SALES_WORDS = /\b(?:hoteller|hotell|pris|bestill|booking)\b/gi;

const coverTitleFrom = (value: string): string => {
  const stripped = value.replace(SALES_WORDS, " ").replace(/\s+/g, " ").trim();
  return clampWords(stripped || "Verdt en tur", 3, 22).toUpperCase();
};

export const fallbackSocialDesign = (input: DesignInput): SocialDesign => {
  const titleSource = input.brief.placeName ?? input.topic;
  return {
    mode: "headline",
    coverTitle: coverTitleFrom(titleSource),
    coverSubline: input.contentPillar === "useful" ? "Dette bør du vite" : "Verdt å se nærmere på",
    question: "Hva passer deg?",
    cards: [],
    cta: "Se utvalget",
  };
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" ? value as Record<string, unknown> : null;

export const parseSocialDesign = (raw: string, mode: "guide" | "headline"): SocialDesign | null => {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }

  const record = asRecord(parsed);
  if (!record) return null;

  const coverTitle = clampWords(String(record.coverTitle ?? ""), 4, 28);
  const coverSubline = clampWords(String(record.coverSubline ?? ""), 8, 42);
  const question = clampWords(String(record.question ?? ""), 10, 48);
  const cta = clampWords(String(record.cta ?? ""), 6, 32);
  if (!coverTitle || !coverSubline) return null;

  const cardsRaw = Array.isArray(record.cards) ? record.cards : [];
  const cards = cardsRaw.slice(0, 3).map((item) => {
    const card = asRecord(item);
    if (!card) return null;
    const title = clampWords(String(card.title ?? ""), 4, 24);
    const summary = clampWords(String(card.summary ?? ""), 16, 90);
    const bullets = Array.isArray(card.bullets)
      ? card.bullets.map((bullet) => clampWords(String(bullet), 4, 24)).filter(Boolean).slice(0, 3)
      : [];
    if (!title || !summary || bullets.length < 3) return null;
    return { title, summary, bullets };
  }).filter((card): card is GuideCard => card !== null);

  if (mode === "guide" && cards.length < 3) return null;

  return {
    mode: mode === "guide" && cards.length >= 3 ? "guide" : "headline",
    coverTitle,
    coverSubline,
    question: question || "Hva passer deg?",
    cards: mode === "guide" ? cards : [],
    cta: cta || "Se utvalget",
  };
};

export const headlineFromCaption = (caption: string): { coverTitle: string; coverSubline: string } => {
  const cleaned = caption
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[#@]\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const blocks = caption
    .replace(/https?:\/\/\S+/g, "")
    .split(/\n+/)
    .map((line) => line.replace(/[#@]\S+/g, "").trim())
    .filter(Boolean);
  const firstBlock = blocks[0] ?? cleaned;
  const sentences = firstBlock.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  const coverTitle = clampWords(sentences[0] ?? firstBlock, 8, 46);
  const second = sentences[1] ?? blocks[1] ?? "";
  return {
    coverTitle: coverTitle || "Se dette",
    coverSubline: clampWords(second, 12, 64),
  };
};

export const placeGuideCopy = (design: SocialDesign, placeName: string): SocialDesign => {
  const sales = /hotell|pris|bestill|booking|rabatt/i;
  const question = design.question && !sales.test(design.question)
    ? design.question
    : `Hvor vil du bo i ${placeName}?`;
  return {
    ...design,
    coverTitle: placeName,
    coverSubline: question,
    question,
    cta: design.cta && !sales.test(design.cta) ? design.cta : "Hvilken ville du valgt?",
  };
};

export const composeGuideCaption = (design: SocialDesign, websiteUrl?: string): string => {
  const lines = [
    design.question,
    "",
    ...design.cards.flatMap((card) => [card.title, card.summary, ""]),
    design.cta.endsWith("?") ? design.cta : `${design.cta}.`,
  ];
  if (websiteUrl) {
    lines.push("", websiteUrl);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

type FallbackReason = "no_client" | "exception" | "parse_null";

const useFallback = (input: DesignInput, reason: FallbackReason): SocialDesign => {
  logger.warn("Fallback-design brukes", {
    reason,
    placeName: input.brief.placeName ?? "mangler",
    topic: input.topic,
  });
  return fallbackSocialDesign(input);
};

export const createSocialDesign = async (input: DesignInput): Promise<SocialDesign> => {
  const mode = input.forceGuide ? "guide" : resolveDesignMode(input.contentPillar, input.visualMotif);
  const client = getOpenAiClient();
  if (!client) return useFallback(input, "no_client");

  const company = input.brandContext?.companyName ?? "bedriften";
  const industry = input.brandContext?.industry ?? "ukjent bransje";
  const place = input.brief.placeName ? `Sted: ${input.brief.placeName}.` : "Ikke finn på et feriested hvis bedriften ikke er i reisebransjen.";

  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      max_output_tokens: 500,
      input: [
        {
          role: "system",
          content: [
            "Du lager teksten som skal stå PÅ et ferdig SoMe-design, ikke en annonse.",
            "Svar kun med JSON.",
            "Konkret, kort, norsk bokmål. Ingen priser, prosenter, «best» eller oppdiktede kunder.",
            "Teksten skal hjelpe leseren å velge, i kundens verden, ikke forklare bedriftens funksjoner.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Bedrift: ${company}. Bransje: ${industry}.`,
            `Tema: ${input.topic}.`,
            place,
            `Modus: ${mode}.`,
            "JSON-form:",
            '{"coverTitle":"","coverSubline":"","question":"","cta":"","cards":[{"title":"","summary":"","bullets":["","",""]}]}',
            "coverTitle er kun stedsnavnet. Aldri hotell, downtown, pris eller bestill.",
            "question er et valg mellom områder i det låste stedet. cta maks 5 ord, uten nettadresse.",
            mode === "guide"
              ? [
                "cards skal ha nøyaktig 3 ekte områder i det låste stedet. Ikke finn på bydeler og ikke bruk en annen by.",
                "title er det lokale navnet, uoversatt. summary er én konkret setning om stedet, uten reklamespråk.",
                "Hvert bullet maks 3 ord.",
                ...(input.brief.world === "travel"
                  ? [
                    "Eksempel for Rhodos: Lindos, Faliraki, Rhodos by. Ikke Downtown Rhodos, Magisk strand eller Hotellområdet.",
                    "Samme regel for Kos, Hurghada og alle andre steder: kjente områder, ellers sentrum, strand og havn.",
                  ]
                  : []),
              ].join(" ")
              : "cards skal være en tom liste.",
          ].join("\n"),
        },
      ],
    });

    const parsed = parseSocialDesign(response.output_text || "", mode);
    return parsed ?? useFallback(input, "parse_null");
  } catch (error) {
    logger.warn("Kunne ikke planlegge slide-tekst", {
      reason: "exception",
      error: error instanceof Error ? error.message : "ukjent",
    });
    return useFallback(input, "exception");
  }
};

const PLACE_LOOK: Record<string, string> = {
  Dubrovnik: "limestone houses, orange clay roof tiles, medieval city walls and the Adriatic",
  Split: "Diocletian's palace stone, the Riva promenade and the Adriatic",
  Rhodos: "the medieval stone old town, or the named beach if the subject is a beach",
  Santorini: "whitewashed buildings, blue domes and the caldera cliff",
  "Gran Canaria": "the named coast, with dunes, palms and Atlantic light",
  Kreta: "Cretan stone, olive landscape, or the named beach",
};

const placeLookCache = new Map<string, string>();

export const knownPlaceLook = (placeName: string | null): string | null => {
  if (!placeName) return null;
  const key = Object.keys(PLACE_LOOK).find((name) => name.toLowerCase() === placeName.toLowerCase());
  return key ? PLACE_LOOK[key] ?? null : null;
};

export const resolvePlaceLook = async (placeName: string | null): Promise<string | null> => {
  const known = knownPlaceLook(placeName);
  if (known || !placeName) return known;
  const cached = placeLookCache.get(placeName.toLowerCase());
  if (cached) return cached;

  const client = getOpenAiClient();
  if (!client) return null;

  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      max_output_tokens: 80,
      input: [
        {
          role: "user",
          content: `One English sentence describing the real architecture and landscape of ${placeName}. No hotel names, prices or superlatives.`,
        },
      ],
    });
    const look = (response.output_text || "").replace(/\s+/g, " ").trim();
    if (!look) return null;
    placeLookCache.set(placeName.toLowerCase(), look);
    return look;
  } catch (error) {
    logger.warn("Kunne ikke hente placeLook", {
      placeName,
      error: error instanceof Error ? error.message : "ukjent",
    });
    return null;
  }
};

const placeLock = (brief: VisualBrief): string =>
  brief.placeName
    ? `Stay in ${brief.placeName}. Do not switch to another country or city.`
    : "Stay in the customer's real world for this brand. Do not invent a beach resort.";

export const buildPhotoSubject = (
  design: SocialDesign,
  brief: VisualBrief,
  slideIndex: number,
): string => {
  const card = slideIndex > 0 ? design.cards[slideIndex - 1] : undefined;
  const place = brief.placeName;
  if (card) {
    return `Photograph the public character of "${card.title}"${place ? ` in ${place}` : ""}. ${card.summary}`;
  }
  return `Photograph a recognizable public view of ${place ?? design.coverTitle}. ${design.coverSubline}`;
};

export const buildPhotoPrompt = (
  design: SocialDesign,
  brief: VisualBrief,
  slideIndex: number,
  kind: "single" | "slide" = "slide",
  resolvedLook?: string | null,
): string => {
  const place = brief.placeName;
  const look = resolvedLook ?? knownPlaceLook(place);
  const subject = buildPhotoSubject(design, brief, slideIndex);
  return [
    kind === "single"
      ? "Editorial photograph for one social post. Place the subject in the upper half of the frame. No design, no poster, no collage."
      : "Editorial photograph for a social carousel background. No design, no poster, no collage.",
    subject,
    placeLock(brief),
    look
      ? `The picture must be recognizable as that place: ${look}.`
      : place
        ? `Match the real architecture and landscape of ${place}. Do not substitute a generic Mediterranean hotel.`
        : "Match the customer's real setting. Do not invent a holiday resort.",
    "Show streets, coast, square or landscape with people in the scene.",
    "Do not invent a hotel, a hotel name, or center the frame on one made-up hotel facade.",
    "One clear scene, natural light, correct anatomy.",
    "ABSOLUTELY NO text, letters, numbers, watermarks, logos or captions anywhere in the image.",
    "Keep the lower third visually calm. Type and the logo are added later, outside the photograph.",
  ].join(" ");
};

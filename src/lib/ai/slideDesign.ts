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

export const fallbackSocialDesign = (input: DesignInput): SocialDesign => {
  const titleSource = input.brief.placeName ?? input.topic;
  return {
    mode: "headline",
    coverTitle: clampWords(titleSource, 3, 22).toUpperCase(),
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

export const createSocialDesign = async (input: DesignInput): Promise<SocialDesign> => {
  const mode = input.forceGuide ? "guide" : resolveDesignMode(input.contentPillar, input.visualMotif);
  const client = getOpenAiClient();
  if (!client) return fallbackSocialDesign(input);

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
            "coverTitle maks 3 ord. coverSubline maks 6 ord. question er et ekte valg. cta maks 5 ord, uten nettadresse.",
            mode === "guide"
              ? "cards skal ha nøyaktig 3 ekte alternativer fra dette temaet. Hvert bullet maks 3 ord. Hvis det er et reisemål, bruk ekte områder der. Hvis det er en annen bransje, bruk ekte valg kunden står overfor."
              : "cards skal være en tom liste.",
          ].join("\n"),
        },
      ],
    });

    const parsed = parseSocialDesign(response.output_text || "", mode);
    return parsed ?? fallbackSocialDesign(input);
  } catch (error) {
    logger.warn("Kunne ikke planlegge slide-tekst", {
      error: error instanceof Error ? error.message : "ukjent",
    });
    return fallbackSocialDesign(input);
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

const placeLook = (placeName: string | null): string | null => {
  if (!placeName) return null;
  const key = Object.keys(PLACE_LOOK).find((name) => name.toLowerCase() === placeName.toLowerCase());
  return key ? PLACE_LOOK[key] ?? null : null;
};

const placeLock = (brief: VisualBrief): string =>
  brief.placeName
    ? `Stay in ${brief.placeName}. Do not switch to another country or city.`
    : "Stay in the customer's real world for this brand. Do not invent a beach resort.";

export const buildPhotoPrompt = (
  design: SocialDesign,
  brief: VisualBrief,
  slideIndex: number,
  kind: "single" | "slide" = "slide",
): string => {
  const card = slideIndex > 0 ? design.cards[slideIndex - 1] : undefined;
  const place = brief.placeName;
  const look = placeLook(place);
  const subject = card
    ? `Photograph the public character of "${card.title}"${place ? ` in ${place}` : ""}. ${card.summary}`
    : `Photograph a recognizable public view of ${place ?? design.coverTitle}. ${design.coverSubline}`;
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

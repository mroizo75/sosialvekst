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

export const createSocialDesign = async (input: DesignInput): Promise<SocialDesign> => {
  const mode = resolveDesignMode(input.contentPillar, input.visualMotif);
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

const sceneLine = (brief: VisualBrief): string =>
  brief.placeName
    ? `The photo is from ${brief.placeName}. ${brief.subjectDirection}`
    : brief.subjectDirection;

const sharedDesignRules = [
  "This is a finished social media graphic, like a magazine carousel slide. Not a plain photograph.",
  "One clear scene. Do not collage a building, a pool, luggage and sunbathers into the same frame.",
  "Photorealistic background, natural people, correct anatomy, no plastic skin.",
  "Render the supplied words exactly, in Norwegian, with correct spelling. Bold modern sans-serif.",
  "Put a simple colored shape or brush behind short text so it stays readable.",
  "Do not add any other words, letters, prices, URLs, watermarks or a logo.",
  "Keep the bottom-left corner visually empty and simple. A small logo is added later.",
].join(" ");

export const buildSlidePrompt = (
  design: SocialDesign,
  brief: VisualBrief,
  slideIndex: number,
): string => {
  const total = design.mode === "guide" ? 4 : 1;
  if (slideIndex <= 0 || design.mode === "headline") {
    return [
      `Square 1:1 cover graphic, slide 1/${total}.`,
      sceneLine(brief),
      sharedDesignRules,
      `Exact text, and nothing else:`,
      `"${design.coverTitle}"`,
      `"${design.coverSubline}"`,
      total > 1 ? `Small corner mark: "1/${total}".` : "",
    ].filter(Boolean).join("\n");
  }

  const card = design.cards[slideIndex - 1];
  if (!card) return buildSlidePrompt({ ...design, mode: "headline" }, brief, 0);
  const indexLabel = `${slideIndex + 1}/${total}`;
  return [
    `Square 1:1 carousel graphic, slide ${indexLabel}.`,
    `Show only this subject: ${card.title}. ${sceneLine(brief)}`,
    sharedDesignRules,
    "Exact text:",
    `Title: "${card.title}"`,
    `Sentence: "${card.summary}"`,
    "Three short labels with simple flat icons:",
    ...card.bullets.map((bullet) => `- "${bullet}"`),
    `Small corner mark: "${indexLabel}".`,
  ].join("\n");
};

export const buildBoardPrompt = (design: SocialDesign, brief: VisualBrief): string => {
  const cards = design.cards.slice(0, 3);
  return [
    "Landscape 16:9 social graphic, one single image, not a collage of unrelated places.",
    sceneLine(brief),
    sharedDesignRules,
    `Top headline, exact text: "${design.question}"`,
    "Under it, three vertical photo columns. Each column has a title, one sentence and three short icon labels.",
    ...cards.flatMap((card, index) => [
      `Column ${index + 1} title: "${card.title}"`,
      `Column ${index + 1} sentence: "${card.summary}"`,
      ...card.bullets.map((bullet) => `Column ${index + 1} label: "${bullet}"`),
    ]),
    `Bottom button, exact text: "${design.cta}". No URL.`,
  ].join("\n");
};

export const imageSizeForDesign = (
  channel: SocialChannel,
  design: SocialDesign,
  reelScript?: boolean,
): "1024x1024" | "1536x1024" | "1024x1536" => {
  if (reelScript) return "1024x1536";
  if (channel === "facebook" && design.mode === "guide") return "1536x1024";
  return "1024x1024";
};

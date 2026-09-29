import type { ContentPillar, VisualMotif } from "@/lib/ai/postStrategy";
import { findCopyIssues } from "@/lib/ai/validateCopy";
import type { VisualBrief } from "@/lib/ai/visualDirection";
import { logger } from "@/lib/logger";
import { getOpenAiClient } from "@/lib/openai";
import type { BrandContext, SocialChannel } from "@/lib/types";

export type GuideCard = {
  title: string;
  summary: string;
  slideLine?: string;
  bullets: string[];
};

export type SocialDesign = {
  mode: "guide" | "headline";
  hook: string;
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
  const words = cleaned.split(" ").filter(Boolean);
  const kept: string[] = [];
  for (const word of words) {
    if (kept.length >= maxWords) break;
    const next = kept.length === 0 ? word : `${kept.join(" ")} ${word}`;
    if (next.length > maxChars) break;
    kept.push(word);
  }
  return kept.join(" ");
};

export const slideLineForImage = (slideLine: string | undefined, title: string): string => {
  const cleaned = (slideLine ?? "").replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 5) return title;
  if (cleaned.length > 42) return title;
  return cleaned;
};

export const resolveDesignMode = (
  _pillar?: ContentPillar,
  motif?: VisualMotif,
  brief?: Pick<VisualBrief, "world" | "placeName">,
): "guide" | "headline" => {
  if (brief?.world === "travel" && brief.placeName) return "guide";
  if (motif === "guide" || motif === "comparison") return "guide";
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
    hook: "",
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
  const coverSubline = clampWords(String(record.coverSubline ?? ""), 14, 64);
  const rawHook = String(record.hook ?? "").replace(/\s+/g, " ").trim();
  const hook = rawHook.endsWith("?") ? "" : clampWords(rawHook, 22, 140);
  const question = clampWords(String(record.question ?? ""), 10, 48);
  const cta = clampWords(String(record.cta ?? ""), 6, 32);
  if (!coverTitle || !coverSubline) return null;

  const cardsRaw = Array.isArray(record.cards) ? record.cards : [];
  const cards = cardsRaw.slice(0, 3).map((item) => {
    const card = asRecord(item);
    if (!card) return null;
    const title = clampWords(String(card.title ?? ""), 4, 24);
    const summary = clampWords(String(card.summary ?? ""), 28, 180);
    const slideLine = slideLineForImage(String(card.slideLine ?? ""), title);
    const bullets = Array.isArray(card.bullets)
      ? card.bullets.map((bullet) => clampWords(String(bullet), 4, 24)).filter(Boolean).slice(0, 3)
      : [];
    if (!title || !summary || bullets.length < 3) return null;
    const built: GuideCard = { title, summary, slideLine, bullets };
    return built;
  }).filter((card): card is GuideCard => card !== null);

  if (mode === "guide" && cards.length < 3) return null;

  return {
    mode: mode === "guide" && cards.length >= 3 ? "guide" : "headline",
    hook,
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

export const guideClosingQuestion = (design: SocialDesign): string => {
  const cta = design.cta.trim();
  if (cta.endsWith("?")) return cta;
  const titles = design.cards.map((card) => card.title.trim()).filter(Boolean);
  if (titles.length === 0) return "Hva velger du?";
  if (titles.length === 1) return `${titles[0]} – hva velger du?`;
  const last = titles[titles.length - 1];
  return `${titles.slice(0, -1).join(", ")} eller ${last} – hva velger du?`;
};

export const composeGuideCaption = (design: SocialDesign, websiteUrl?: string): string => {
  const lines = [
    design.hook.trim(),
    design.question.trim(),
    "",
    ...design.cards.flatMap((card) => [card.title, card.summary, ""]),
    guideClosingQuestion(design),
  ].filter((line, index, all) => line !== "" || (index > 0 && all[index - 1] !== ""));
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

const designCopyIssues = (design: SocialDesign, input: DesignInput): string[] => {
  const check = { placeName: input.brief.placeName, pillar: input.contentPillar };
  const caption = findCopyIssues(composeGuideCaption(design), check);
  const cards = design.cards.flatMap((card) => findCopyIssues(
    [card.title, card.summary, card.slideLine ?? ""].filter(Boolean).join(". "),
    check,
  ));
  return [...caption, ...cards];
};

const designUserPrompt = (input: DesignInput, mode: "guide" | "headline", issues: string[]): string => {
  const company = input.brandContext?.companyName ?? "bedriften";
  const industry = input.brandContext?.industry ?? "ukjent bransje";
  const travel = input.brief.world === "travel" && Boolean(input.brief.placeName);
  const shared = [
    `Bedrift: ${company}. Bransje: ${industry}.`,
    `Tema: ${input.topic}.`,
    travel
      ? `Sted: ${input.brief.placeName}.`
      : "Ikke finn på et feriested, et land eller en by. Dette er ikke et reiseinnlegg.",
    `Modus: ${mode}.`,
    "JSON-form:",
    '{"hook":"","coverTitle":"","coverSubline":"","question":"","cta":"","cards":[{"title":"","summary":"","slideLine":"","bullets":["","",""]}]}',
  ];
  const travelLines = [
    "hook er én setning, ikke et spørsmål, og konkret om stedet.",
    "coverTitle er kun stedsnavnet. Aldri hotell, downtown, pris eller bestill.",
    "question kommer rett etter hook og er et valg mellom områder i det låste stedet. cta skal være et spørsmål, uten nettadresse.",
    mode === "guide"
      ? [
        "cards skal ha nøyaktig 3 ekte områder i det låste stedet. Ikke finn på bydeler og ikke bruk en annen by.",
        "title er det lokale navnet, uoversatt.",
        "summary: To korte setninger. Setning 1: én konkret, verifiserbar detalj om området (severdighet, type strand, avstand). Setning 2: «For deg som …». Ingen adjektiver som vakker, flott, sjarmerende, livlig, fantastisk. Er du usikker på en detalj, dropp den og skriv bare hvem området passer for.",
        "slideLine: maks 5 ord, en komplett frase, ingen adjektiver som vakre, flotte eller sjarmerende.",
        "Hvert bullet maks 3 ord.",
        "Eksempel for Rhodos: Lindos, Faliraki, Rhodos by. Ikke Downtown Rhodos, Magisk strand eller Hotellområdet.",
        "Samme regel for Kos, Hurghada og alle andre steder: kjente områder, ellers sentrum, strand og havn.",
      ].join(" ")
      : "cards skal være en tom liste.",
  ];
  const genericLines = [
    "hook er én setning, ikke et spørsmål, og konkret om temaet i kundens fag. Ikke et stedsnavn.",
    "coverTitle er temaet i 1–4 ord. Ikke et sted.",
    "question er et konkret valg i kundens verden. cta skal være et spørsmål, uten nettadresse.",
    mode === "guide"
      ? [
        "cards skal ha nøyaktig 3 konkrete alternativer, steg eller tips i kundens fag. Ikke områder, byer eller strender.",
        "title er navnet på alternativet, steget eller tipset.",
        "summary: To korte setninger om hva kunden faktisk gjør eller velger. Ingen adjektiver som vakker, flott, sjarmerende, livlig, fantastisk.",
        "slideLine: maks 5 ord, en komplett frase.",
        "Hvert bullet maks 3 ord.",
      ].join(" ")
      : "cards skal være en tom liste.",
  ];
  return [
    ...shared,
    ...(travel ? travelLines : genericLines),
    ...(issues.length > 0 ? [`Forrige utkast ble avvist fordi: ${issues.join(" ")}`] : []),
  ].join("\n");
};

export const createSocialDesign = async (input: DesignInput): Promise<SocialDesign> => {
  const mode = input.forceGuide
    ? "guide"
    : resolveDesignMode(input.contentPillar, input.visualMotif, input.brief);
  const client = getOpenAiClient();
  if (!client) return useFallback(input, "no_client");

  const ask = async (issues: string[]): Promise<SocialDesign | null> => {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      max_output_tokens: 800,
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
        { role: "user", content: designUserPrompt(input, mode, issues) },
      ],
    });
    return parseSocialDesign(response.output_text || "", mode);
  };

  try {
    const first = await ask([]);
    if (!first) return useFallback(input, "parse_null");
    if (mode !== "guide") return first;
    const issues = designCopyIssues(first, input);
    if (issues.length === 0) return first;
    return (await ask(issues)) ?? first;
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

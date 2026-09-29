import { resolveCopyModel } from "@/lib/ai/models";
import type { ContentPillar, VisualMotif } from "@/lib/ai/postStrategy";
import { findCopyIssues } from "@/lib/ai/validateCopy";
import type { VisualBrief, VisualWorld } from "@/lib/ai/visualDirection";
import { logger } from "@/lib/logger";
import { getOpenAiClient } from "@/lib/openai";
import type { BrandContext, SocialChannel } from "@/lib/types";

export type GuideCard = {
  title: string;
  summary: string;
  photoSubject: string;
};

export type SocialDesign = {
  mode: "guide" | "headline";
  hook: string;
  coverKicker: string;
  coverTitle: string;
  coverSubline: string;
  coverPhotoSubject: string;
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
  avoidRepeating?: string[];
};

export const DESIGN_LIMITS = {
  coverKicker: 3,
  coverTitle: 7,
  coverSubline: 14,
  cardTitle: 5,
  summary: 24,
  cta: 9,
  cards: 3,
} as const;

const SALES_WORDS = /\b(?:hoteller|hotell|pris|priser|bestill|booking|rabatt)\b/i;

const clean = (value: unknown): string =>
  String(value ?? "").replace(/\s+/g, " ").replace(/[«»"]/g, "").trim();

const wordCount = (value: string): number => value.split(" ").filter(Boolean).length;

export const sentencesWithin = (value: string, maxWords: number): string => {
  const sentences = clean(value).split(/(?<=[.!?])\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const sentence of sentences) {
    if (kept.length > 0 && wordCount([...kept, sentence].join(" ")) > maxWords) break;
    kept.push(sentence);
  }
  return kept.join(" ");
};

export const resolveDesignMode = (channel: SocialChannel): "guide" | "headline" =>
  channel === "instagram" || channel === "facebook" ? "guide" : "headline";

const fallbackTitle = (value: string): string => {
  const words = value.replace(new RegExp(SALES_WORDS.source, "gi"), " ").split(/\s+/).filter(Boolean);
  const title = words.slice(0, 6).join(" ");
  return title ? `${title.charAt(0).toUpperCase()}${title.slice(1)}` : "Verdt å vite";
};

export const fallbackSocialDesign = (input: DesignInput): SocialDesign => ({
  mode: "headline",
  hook: "",
  coverKicker: "",
  coverTitle: fallbackTitle(input.brief.placeName ?? input.topic),
  coverSubline: input.contentPillar === "useful" ? "Dette bør du vite." : "Verdt å se nærmere på.",
  coverPhotoSubject: "",
  question: "Hva passer deg?",
  cards: [],
  cta: "Hva velger du?",
});

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

  const coverTitle = clean(record.coverTitle);
  const coverSubline = clean(record.coverSubline);
  if (!coverTitle || !coverSubline) return null;

  const cardsRaw = Array.isArray(record.cards) ? record.cards : [];
  const cards = cardsRaw
    .map((item): GuideCard | null => {
      const card = asRecord(item);
      if (!card) return null;
      const title = clean(card.title);
      const summary = clean(card.summary);
      if (!title || !summary) return null;
      return { title, summary, photoSubject: clean(card.photoSubject) };
    })
    .filter((card): card is GuideCard => card !== null)
    .slice(0, DESIGN_LIMITS.cards);

  if (mode === "guide" && cards.length < DESIGN_LIMITS.cards) return null;
  const rawHook = clean(record.hook);

  return {
    mode,
    hook: rawHook.endsWith("?") ? "" : rawHook,
    coverKicker: clean(record.coverKicker),
    coverTitle,
    coverSubline,
    coverPhotoSubject: clean(record.coverPhotoSubject),
    question: clean(record.question) || "Hva passer deg?",
    cards: mode === "guide" ? cards : [],
    cta: clean(record.cta) || "Hva velger du?",
  };
};

const overLimit = (label: string, value: string, max: number): string | null => {
  const count = wordCount(value);
  return count > max ? `${label} har ${count} ord, maks ${max}.` : null;
};

export const designLengthIssues = (design: SocialDesign): string[] => [
  overLimit("coverKicker", design.coverKicker, DESIGN_LIMITS.coverKicker),
  overLimit("coverTitle", design.coverTitle, DESIGN_LIMITS.coverTitle),
  overLimit("coverSubline", design.coverSubline, DESIGN_LIMITS.coverSubline),
  overLimit("cta", design.cta, DESIGN_LIMITS.cta),
  ...design.cards.flatMap((card, index) => [
    overLimit(`cards[${index}].title`, card.title, DESIGN_LIMITS.cardTitle),
    overLimit(`cards[${index}].summary`, card.summary, DESIGN_LIMITS.summary),
  ]),
].filter((issue): issue is string => issue !== null);

export const fitDesignToLimits = (design: SocialDesign): SocialDesign => ({
  ...design,
  coverKicker: wordCount(design.coverKicker) > DESIGN_LIMITS.coverKicker ? "" : design.coverKicker,
  coverSubline: sentencesWithin(design.coverSubline, DESIGN_LIMITS.coverSubline),
  cards: design.cards.map((card) => ({
    ...card,
    summary: sentencesWithin(card.summary, DESIGN_LIMITS.summary),
  })),
});

export const placeGuideCopy = (design: SocialDesign, placeName: string): SocialDesign => {
  const question = design.question && !SALES_WORDS.test(design.question)
    ? design.question
    : `Hvor vil du bo i ${placeName}?`;
  const titleKeepsPlace = design.coverTitle.toLowerCase().includes(placeName.toLowerCase())
    && !SALES_WORDS.test(design.coverTitle);
  const written = design.coverSubline.trim();
  return {
    ...design,
    coverTitle: titleKeepsPlace ? design.coverTitle : placeName,
    coverSubline: written && !SALES_WORDS.test(written) ? written : question,
    question,
    cta: design.cta && !SALES_WORDS.test(design.cta) ? design.cta : "Hvilken ville du valgt?",
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

const designFallback = (input: DesignInput, reason: FallbackReason): SocialDesign => {
  logger.warn("Fallback-design brukes", {
    reason,
    placeName: input.brief.placeName ?? "mangler",
    topic: input.topic,
  });
  return fallbackSocialDesign(input);
};

const designCopyIssues = (design: SocialDesign, input: DesignInput): string[] => {
  const check = { placeName: input.brief.placeName, pillar: input.contentPillar };
  const cover = findCopyIssues([design.coverTitle, design.coverSubline].join(". "), check);
  const cards = design.cards.flatMap((card) => findCopyIssues(
    `${card.title}. ${card.summary}`,
    { pillar: input.contentPillar },
  ));
  return [...new Set([...designLengthIssues(design), ...cover, ...cards])];
};

export const DESIGN_SYSTEM_PROMPT = [
  "Du er kreativ leder og tekstforfatter i et norsk SoMe-byrå. Du lager karuseller som stopper scrolling på Instagram og Facebook.",
  "Svar kun med JSON etter skjemaet.",
  "",
  "FORSIDEN (viktigst):",
  `- coverTitle: 2–${DESIGN_LIMITS.coverTitle} ord. Et konkret løfte, en kontrast, et antall eller en påstand som slidesene innfrir. Skal kunne leses på ett sekund.`,
  "- Gode eksempler: «3 tegn på at røret lekker», «Søndagsmiddag uten oppvask», «Fristen mange glemmer i mars», «Rhodos på tre måter».",
  "- Dårlige eksempler: «Velkommen til oss», «Kvalitet i alle ledd», «Vi hjelper deg», «Tips og triks».",
  `- coverKicker: 1–${DESIGN_LIMITS.coverKicker} ord som etikett over tittelen, for eksempel «Våtrom», «Guide» eller «Før du bestiller».`,
  `- coverSubline: én hel setning, maks ${DESIGN_LIMITS.coverSubline} ord, som sier hva leseren får ved å sveipe.`,
  "- coverPhotoSubject: ett konkret fotomotiv på engelsk for forsiden. Det sterkeste og mest menneskelige bildet i serien.",
  "",
  "SLIDES:",
  `- cards: nøyaktig ${DESIGN_LIMITS.cards} når modus er guide, ellers en tom liste. Én idé per slide, i logisk rekkefølge.`,
  `- title: 2–${DESIGN_LIMITS.cardTitle} ord.`,
  `- summary: 1–2 korte setninger, maks ${DESIGN_LIMITS.summary} ord. Forklar konkret hva, hvorfor eller hvordan. Ingen fyllord.`,
  "- photoSubject: ett konkret fotomotiv på engelsk som viser akkurat denne sliden i bransjens virkelige miljø. Mennesker eller hender i handling der det passer. Ingen skjermer, skilt eller tekst.",
  "",
  "AVSLUTNING:",
  `- cta: maks ${DESIGN_LIMITS.cta} ord. Et konkret spørsmål eller neste steg. Ingen nettadresse, ikke «kontakt oss».`,
  "- hook: første setning i posteksten. Ikke et spørsmål. Konkret.",
  "- question: et konkret valg-spørsmål til leseren.",
  "",
  "ALLTID:",
  "- Korrekt norsk bokmål. Snakk til leseren med «du».",
  "- Ingen priser, prosenter, «best», garantier eller oppdiktede kunder og tall. Et tall i tittelen kan bare være antall slides.",
  "- Verdi for leseren først. Bedriften er avsender, ikke tema.",
  "- Bare ferdige setninger. Aldri stopp midt i en setning.",
].join("\n");

const DESIGN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hook", "coverKicker", "coverTitle", "coverSubline", "coverPhotoSubject", "question", "cta", "cards"],
  properties: {
    hook: { type: "string" },
    coverKicker: { type: "string" },
    coverTitle: { type: "string" },
    coverSubline: { type: "string" },
    coverPhotoSubject: { type: "string" },
    question: { type: "string" },
    cta: { type: "string" },
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary", "photoSubject"],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          photoSubject: { type: "string" },
        },
      },
    },
  },
} as const;

const listLine = (label: string, values: string[] | undefined): string | null => {
  const items = (values ?? []).map((value) => value.trim()).filter(Boolean).slice(0, 5);
  return items.length > 0 ? `${label}: ${items.join(", ")}.` : null;
};

export const designUserPrompt = (input: DesignInput, mode: "guide" | "headline", issues: string[]): string => {
  const ctx = input.brandContext ?? {};
  const place = input.brief.world === "travel" ? input.brief.placeName : null;
  const lines = [
    `Bedrift: ${ctx.companyName ?? "bedriften"}. Bransje: ${ctx.industry ?? "ukjent bransje"}.`,
    ctx.targetAudience ? `Målgruppe: ${ctx.targetAudience}.` : null,
    listLine("Produkter og tjenester", [...(ctx.products ?? []), ...(ctx.services ?? [])]),
    listLine("Det som skiller bedriften ut", ctx.uniqueSellingPoints),
    listLine("Kundenes typiske problemer", ctx.customerPainPoints),
    `Tema: ${input.topic}.`,
    input.contentPillar ? `Innholdssøyle: ${input.contentPillar}.` : null,
    `Modus: ${mode}.`,
    place
      ? [
        `Sted: ${place}. Hold deg i dette stedet.`,
        `coverTitle skal inneholde «${place}». Aldri hotell, pris eller bestill.`,
        mode === "guide"
          ? `cards er ${DESIGN_LIMITS.cards} ekte, kjente områder i ${place}. title er det lokale navnet, uoversatt. summary: én konkret, sann detalj om området og «For deg som …». Er du usikker på en detalj, skriv bare hvem området passer for.`
          : null,
      ].filter(Boolean).join(" ")
      : "Ikke finn på et feriested, et land eller en by. Hold deg i kundens fag og hverdag.",
    input.avoidRepeating?.length
      ? `Ikke gjenta vinkler eller titler fra disse innleggene: ${input.avoidRepeating.slice(-5).join(" | ")}`
      : null,
    issues.length > 0 ? `Forrige utkast ble avvist fordi: ${issues.join(" ")}` : null,
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
};

export const createSocialDesign = async (input: DesignInput): Promise<SocialDesign> => {
  const mode = resolveDesignMode(input.channel);
  const client = getOpenAiClient();
  if (!client) return designFallback(input, "no_client");

  const ask = async (issues: string[]): Promise<SocialDesign | null> => {
    const response = await client.responses.create({
      model: resolveCopyModel(),
      max_output_tokens: 1200,
      text: {
        format: {
          type: "json_schema",
          name: "social_design",
          strict: true,
          schema: DESIGN_SCHEMA,
        },
      },
      input: [
        { role: "system", content: DESIGN_SYSTEM_PROMPT },
        { role: "user", content: designUserPrompt(input, mode, issues) },
      ],
    });
    return parseSocialDesign(response.output_text || "", mode);
  };

  try {
    const first = await ask([]);
    if (!first) return designFallback(input, "parse_null");
    const issues = designCopyIssues(first, input);
    if (issues.length === 0) return first;
    const second = await ask(issues);
    if (!second) return fitDesignToLimits(first);
    const secondIssues = designCopyIssues(second, input);
    const best = secondIssues.length <= issues.length ? second : first;
    if (secondIssues.length > 0) {
      logger.warn("Slide-tekst avvist to ganger, tilpasser beste utkast", { issues: secondIssues });
    }
    return fitDesignToLimits(best);
  } catch (error) {
    logger.warn("Kunne ikke planlegge slide-tekst", {
      reason: "exception",
      error: error instanceof Error ? error.message : "ukjent",
    });
    return designFallback(input, "exception");
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

const WORLD_STYLE: Record<VisualWorld, string> = {
  travel: "Travel photography with the real light and atmosphere of the place. People enjoying it, not posing.",
  food: "Appetizing food and hospitality photography. Warm practical light, real plates, real guests.",
  craft: "Documentary photography on a real job site or workshop. Hands, tools and materials in action, realistic workwear.",
  generic: "Documentary lifestyle photography of the customer's real situation. Natural, unposed people.",
};

export const buildPhotoSubject = (
  design: SocialDesign,
  brief: VisualBrief,
  slideIndex: number,
): string => {
  const card = slideIndex > 0 ? design.cards[slideIndex - 1] : undefined;
  const planned = card ? card.photoSubject : design.coverPhotoSubject;
  if (planned) return planned;
  const place = brief.placeName ? ` in ${brief.placeName}` : "";
  if (card) return `${card.title}${place}. ${card.summary}`;
  return `${design.coverTitle}${place}. ${brief.subjectDirection}`;
};

export const buildPhotoPrompt = (
  design: SocialDesign,
  brief: VisualBrief,
  slideIndex: number,
  resolvedLook?: string | null,
  industry?: string,
): string => {
  const place = brief.placeName;
  const look = resolvedLook ?? knownPlaceLook(place);
  const textZone = slideIndex === 0 ? "lower third" : "lower 40 percent";
  return [
    "Authentic editorial photograph for a Norwegian company's social media carousel.",
    "Shot by a professional photographer on a full-frame camera, 35mm lens, natural light, real textures, gentle depth of field.",
    `Subject: ${buildPhotoSubject(design, brief, slideIndex)}`,
    WORLD_STYLE[brief.world],
    industry ? `Industry: ${industry}. Show the real environment of this trade, not an office.` : null,
    place
      ? `Location: ${place}.${look ? ` It must be recognizable: ${look}.` : ""} Do not switch to another country or city. Do not invent a hotel or a hotel name.`
      : "Setting: realistic Norwegian or Scandinavian surroundings. Do not invent a holiday resort.",
    `One strong focal point in the upper part of the frame. Keep the ${textZone} simple and slightly darker, because a headline is placed there.`,
    "Keep the top-left corner free of important detail. A logo is added there later.",
    "No stock-photo clichés: no handshakes, no people posing at a laptop, no headsets, no 3D render, no illustration.",
    "Correct anatomy, realistic proportions, no AI artifacts.",
    "ABSOLUTELY NO text, letters, numbers, signs, logos, watermarks, screens with UI or captions anywhere in the photograph.",
  ].filter((line): line is string => Boolean(line)).join(" ");
};

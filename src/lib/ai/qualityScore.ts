import type { QualityScore } from "@/lib/types";

type QualityScoreInput = {
  text: string;
  imageUrl?: string;
  hasBrandMatch: boolean;
  hasForbiddenTerms: boolean;
  companyName?: string;
};

const CTA_PATTERNS = [
  /ta kontakt/i,
  /les mer/i,
  /del (denne|gjerne|i kommentar)/i,
  /f[oø]lg oss/i,
  /hva (tenker|mener|er|synes) du/i,
  /kom(menter|mentar)/i,
  /bes[oø]k/i,
  /pr[oø]v/i,
  /meld deg/i,
  /tagg en/i,
  /book/i,
  /bestill/i,
  /ring oss/i,
  /send (oss |en )?melding/i,
  /sjekk ut/i,
  /neste steg/i,
  /klar for/i,
  /vil du vite/i,
  /start (med|din|i dag|gratis|her)/i,
  /registrer deg/i,
  /last ned/i,
  /opplev/i,
  /finn ut/i,
  /din erfaring/i,
];

const GENERIC_PHRASES = [
  "i en stadig skiftende verden",
  "vi er lidenskapelig opptatt av",
  "kontakt oss i dag",
  "ta gjerne kontakt",
  "vi hjelper deg gjerne",
  "vi er stolte av",
  "i dagens marked",
  "en helhetlig losning",
];

const detectCta = (text: string): boolean =>
  CTA_PATTERNS.some((pattern) => pattern.test(text));

const detectCompanyMention = (text: string, companyName?: string): boolean => {
  if (!companyName) return false;
  const normalized = text.toLowerCase();
  const fullName = companyName.toLowerCase().trim();

  if (normalized.includes(fullName)) return true;

  const withoutSuffix = fullName
    .replace(/\s+(as|a\/s|ans|da|sa|asa|stiftelse|forening)\s*$/i, "")
    .trim();

  if (withoutSuffix.length >= 3 && normalized.includes(withoutSuffix)) return true;

  const words = fullName.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length >= 2) {
    const matchedWords = words.filter((w) => normalized.includes(w));
    if (matchedWords.length >= Math.ceil(words.length * 0.7)) return true;
  }

  return false;
};

const countGenericPhrases = (text: string): number => {
  const normalized = text.toLowerCase();
  return GENERIC_PHRASES.filter((phrase) => normalized.includes(phrase)).length;
};

const scoreSentenceVariety = (text: string): number => {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
  if (sentences.length < 2) return 50;
  const lengths = sentences.map((s) => s.trim().split(/\s+/).length);
  const avg = lengths.reduce((sum, l) => sum + l, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / lengths.length;
  return Math.min(100, 60 + variance * 2);
};

export const calculateQualityScore = (input: QualityScoreInput): QualityScore => {
  const ctaPresent = detectCta(input.text);
  const companyMentioned = detectCompanyMention(input.text, input.companyName);
  const genericCount = countGenericPhrases(input.text);
  const sentenceVariety = scoreSentenceVariety(input.text);

  const textLength = input.text.length;
  const languageBase = textLength > 80 && textLength < 2000 ? 80 : 55;
  const languageQuality = Math.min(100, languageBase + sentenceVariety * 0.2 - genericCount * 10);

  const brandMatch = companyMentioned
    ? input.hasBrandMatch ? 95 : 80
    : input.hasBrandMatch ? 60 : 30;

  const factualClarity = Math.min(100, 70 + (input.text.match(/\d+/g)?.length ?? 0) * 5);

  const engagementBase = ctaPresent ? 80 : 50;
  const addressesReader = input.text.toLowerCase().includes("du") ? 10 : 0;
  const hasQuestion = input.text.includes("?") ? 8 : 0;
  const engagementPotential = Math.min(100, engagementBase + addressesReader + hasQuestion);

  const visualQuality = input.imageUrl ? 85 : 40;

  const forbiddenPenalty = input.hasForbiddenTerms ? 25 : 0;
  const genericPenalty = genericCount * 8;

  const rawTotal =
    (languageQuality + brandMatch + factualClarity + engagementPotential + visualQuality) / 5;
  const total = Math.max(0, Math.round(rawTotal - forbiddenPenalty - genericPenalty));

  return {
    languageQuality: Math.round(languageQuality),
    brandMatch: Math.round(brandMatch),
    factualClarity: Math.round(factualClarity),
    engagementPotential: Math.round(engagementPotential),
    visualQuality: Math.round(visualQuality),
    ctaPresent,
    companyMentioned,
    total,
  };
};

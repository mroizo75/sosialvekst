import type { ContentPillar } from "@/lib/ai/postStrategy";
import type { QualityScore } from "@/lib/types";

type QualityScoreInput = {
  text: string;
  imageUrl?: string;
  hasForbiddenTerms: boolean;
  companyName?: string;
  profileTerms?: string[];
  pillar?: ContentPillar;
};

const wordPattern = (source: string): RegExp =>
  new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${source})(?:[^\\p{L}\\p{N}]|$)`, "iu");

const CTA_PATTERNS = [
  wordPattern("ta kontakt"),
  wordPattern("les mer"),
  wordPattern("del (?:denne|gjerne|i kommentar)"),
  wordPattern("f[oø]lg (?:oss|med)"),
  wordPattern("hva (?:tenker|mener|er|synes) du"),
  wordPattern("kom(?:menter|mentar)"),
  wordPattern("bes[oø]k"),
  wordPattern("meld deg"),
  wordPattern("tagg en"),
  wordPattern("bestill"),
  wordPattern("ring oss"),
  wordPattern("send (?:den|oss|en)"),
  wordPattern("sjekk ut"),
  wordPattern("neste steg"),
  wordPattern("vil du vite"),
  wordPattern("start (?:med|din|i dag|gratis|her)"),
  wordPattern("registrer deg"),
  wordPattern("last ned"),
  wordPattern("finn ut"),
  wordPattern("finn dagens"),
  wordPattern("din erfaring"),
  wordPattern("hvilken"),
  wordPattern("ville du"),
  wordPattern("lagre denne"),
  wordPattern("skriv (?:det|valget|under)"),
  wordPattern("se utvalget"),
  wordPattern("se hva som finnes"),
  wordPattern("passer deg"),
  wordPattern("spørsmål\\?"),
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
  "en helhetlig løsning",
  "spare deg tid og bekymringer",
  "omfattende utvalg",
  "omfattende hotellutvalg",
  "gjøre reisen din enklere",
  "gjøre det enklere",
  "knirkefritt",
  "ta kontakt for en uforpliktende prat",
  "les mer på nettsiden",
  "se hvordan vi kan",
];

export const UNDOCUMENTED_CLAIM_PATTERNS = [
  /vi hjalp nylig/i,
  /vi hjalp en (familie|kunde|par)/i,
  /best pris/i,
  /billigere enn (andre|konkurrent)/i,
  /\d+\s*%\s*billigere/i,
  /kunden sa/i,
  /en kunde fortalte/i,
  /garantert laveste/i,
];

export const hasUndocumentedClaim = (text: string): boolean =>
  UNDOCUMENTED_CLAIM_PATTERNS.some((pattern) => pattern.test(text));

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
  const languageBase = textLength > 40 && textLength < 1600 ? 82 : 70;
  const languageQuality = Math.min(100, languageBase + sentenceVariety * 0.15 - genericCount * 10);

  const terms = (input.profileTerms ?? []).map((term) => term.trim()).filter((term) => term.length >= 3);
  const mentionsProfile = terms.some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return wordPattern(escaped).test(input.text);
  });
  const brandMatch = terms.length === 0 ? 62 : mentionsProfile ? 92 : 48;

  const numberCount = input.text.match(/\d+/g)?.length ?? 0;
  const penalizeNumbers = input.pillar === "inspiration" || input.pillar === "useful";
  const factualClarity = Math.max(0, 70 - (penalizeNumbers ? numberCount * 8 : 0));

  const engagementBase = ctaPresent ? 80 : 50;
  const addressesReader = /\bdu\b/i.test(input.text) ? 10 : 0;
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

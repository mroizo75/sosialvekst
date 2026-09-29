import type { ContentPillar } from "@/lib/ai/postStrategy";

const HASHTAG = /#([\p{L}\p{N}_]+)/gu;
const HASHTAG_PUNCTUATION = /#([\p{L}\p{N}_]+)[.,!?;:]+/gu;

const BANNED_PHRASES = [
  "send dette til",
  "send den til",
  "lagre denne",
  "tagg en",
  "tagg en venn",
  "visste du",
  "det er noe helt spesielt",
  "drømmeferie",
  "feriedrømmen",
];

const BANNED_ADJECTIVES = ["vakker", "vakre", "flott", "flotte", "sjarmerende", "livlig", "fantastisk"];

const CATALOG_COUNT = /\d[^\n]{0,24}\b(?:hoteller|land)\b|\b(?:hoteller|land)\b[^\n]{0,24}\d/i;

export type CopyCheck = {
  placeName?: string | null;
  pillar?: ContentPillar;
  allowQuestion?: boolean;
};

export const autoFixCopy = (text: string): string => {
  const stripped = text.replace(HASHTAG_PUNCTUATION, "#$1");
  const tags: string[] = [];
  const withoutTags = stripped.replace(HASHTAG, (match) => {
    if (tags.length < 3 && !tags.includes(match)) tags.push(match);
    return "";
  });
  const body = withoutTags
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (tags.length === 0) return body;
  return `${body}\n${tags.join(" ")}`;
};

const firstSentence = (text: string): string => {
  const trimmed = text.trim();
  const match = trimmed.match(/^[\s\S]*?[.!?]/);
  return (match?.[0] ?? trimmed).trim();
};

const mentionsPlace = (text: string, placeName: string): boolean => {
  const escaped = placeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:[^\\p{L}\\p{N}]|$)`, "iu").test(text);
};

export const findCopyIssues = (text: string, check: CopyCheck): string[] => {
  const issues: string[] = [];
  if (!check.allowQuestion && firstSentence(text).endsWith("?")) {
    issues.push("Første setning slutter med spørsmålstegn.");
  }

  const lower = text.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) issues.push(`Inneholder «${phrase}».`);
  }
  for (const word of BANNED_ADJECTIVES) {
    if (new RegExp(`(?:^|[^\\p{L}])${word}(?:[^\\p{L}]|$)`, "iu").test(text)) {
      issues.push(`Inneholder «${word}».`);
    }
  }

  if (check.placeName && !mentionsPlace(text, check.placeName)) {
    issues.push(`Stedet ${check.placeName} nevnes ikke.`);
  }

  if ((check.pillar === "inspiration" || check.pillar === "useful") && CATALOG_COUNT.test(text)) {
    issues.push("Inneholder tall om hoteller eller land.");
  }

  return issues;
};

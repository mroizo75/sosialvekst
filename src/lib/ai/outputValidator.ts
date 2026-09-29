import type { BrandRules } from "@/lib/ai/brandRules";
import type { ContentPillar } from "@/lib/ai/postStrategy";
import { calculateQualityScore, hasUndocumentedClaim } from "@/lib/ai/qualityScore";
import { findCopyIssues } from "@/lib/ai/validateCopy";
import type { QualityScore } from "@/lib/types";

type ValidationInput = {
  text: string;
  imageUrl?: string;
  brandRules: BrandRules;
  companyName?: string;
  profileTerms?: string[];
  pillar?: ContentPillar;
  placeName?: string | null;
};

type ValidationResult = {
  approved: boolean;
  quality: QualityScore;
  reasons: string[];
};

const MIN_QUALITY_THRESHOLD = 65;
const MIN_TEXT_LENGTH = 20;
const MAX_TEXT_LENGTH = 1800;

export const validateAiOutput = (input: ValidationInput): ValidationResult => {
  const normalized = input.text.toLowerCase();
  const reasons: string[] = [];

  const containsForbiddenTerm = input.brandRules.prohibitedTerms.some((term) =>
    normalized.includes(term.toLowerCase()),
  );
  const undocumentedClaim = hasUndocumentedClaim(input.text);

  const quality = calculateQualityScore({
    text: input.text,
    imageUrl: input.imageUrl,
    hasForbiddenTerms: containsForbiddenTerm || undocumentedClaim,
    companyName: input.companyName,
    profileTerms: input.profileTerms,
    pillar: input.pillar,
  });

  if (containsForbiddenTerm) {
    reasons.push("Inneholder forbudte uttrykk");
  }

  if (undocumentedClaim) {
    reasons.push("Inneholder udokumentert påstand eller oppdiktet kundehistorie");
  }

  if (!quality.ctaPresent) {
    reasons.push("Mangler tydelig oppfordring til handling (CTA)");
  }

  if (input.text.length < MIN_TEXT_LENGTH) {
    reasons.push("Teksten er for kort");
  }

  if (input.text.length > MAX_TEXT_LENGTH) {
    reasons.push("Teksten er for lang for en SoMe-post");
  }

  if (quality.brandMatch < 50) {
    reasons.push("Innholdet mangler tydelig kobling til bedriftens nøkkelbudskap");
  }

  if (quality.total < MIN_QUALITY_THRESHOLD) {
    reasons.push(`Kvalitetsscore (${quality.total}) er under terskel (${MIN_QUALITY_THRESHOLD})`);
  }

  for (const issue of findCopyIssues(input.text, { placeName: input.placeName, pillar: input.pillar })) {
    reasons.push(issue);
  }

  return {
    approved: reasons.length === 0,
    quality,
    reasons,
  };
};

export const getMinQualityThreshold = (): number => MIN_QUALITY_THRESHOLD;

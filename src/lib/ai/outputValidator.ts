import type { BrandRules } from "@/lib/ai/brandRules";
import { calculateQualityScore, hasUndocumentedClaim } from "@/lib/ai/qualityScore";
import type { QualityScore } from "@/lib/types";

type ValidationInput = {
  text: string;
  imageUrl?: string;
  brandRules: BrandRules;
  companyName?: string;
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

  const hasBrandMatch = input.brandRules.keyMessages.some((message) =>
    normalized.includes(message.toLowerCase().slice(0, 12)),
  );

  const quality = calculateQualityScore({
    text: input.text,
    imageUrl: input.imageUrl,
    hasBrandMatch,
    hasForbiddenTerms: containsForbiddenTerm || undocumentedClaim,
    companyName: input.companyName,
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

  return {
    approved: reasons.length === 0,
    quality,
    reasons,
  };
};

export const getMinQualityThreshold = (): number => MIN_QUALITY_THRESHOLD;

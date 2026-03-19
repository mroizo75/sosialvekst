import { defaultBrandRules, type BrandRules } from "@/lib/ai/brandRules";
import { validateAiOutput } from "@/lib/ai/outputValidator";

type PolicyInput = {
  text: string;
  imageUrl?: string;
  brandRules?: BrandRules;
  companyName?: string;
};

export type PolicyDecision = {
  status: "draft" | "needs_review";
  reasons: string[];
  quality: {
    languageQuality: number;
    brandMatch: number;
    factualClarity: number;
    engagementPotential: number;
    visualQuality: number;
    ctaPresent: boolean;
    companyMentioned: boolean;
    total: number;
  };
};

export const evaluatePolicy = (input: PolicyInput): PolicyDecision => {
  const validation = validateAiOutput({
    text: input.text,
    imageUrl: input.imageUrl,
    brandRules: input.brandRules ?? defaultBrandRules,
    companyName: input.companyName,
  });

  return {
    status: validation.approved ? "draft" : "needs_review",
    reasons: validation.reasons,
    quality: validation.quality,
  };
};

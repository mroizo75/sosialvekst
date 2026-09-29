import { defaultBrandRules, type BrandRules } from "@/lib/ai/brandRules";
import type { ContentPillar } from "@/lib/ai/postStrategy";
import { validateAiOutput } from "@/lib/ai/outputValidator";

type PolicyInput = {
  text: string;
  imageUrl?: string;
  brandRules?: BrandRules;
  companyName?: string;
  profileTerms?: string[];
  pillar?: ContentPillar;
  placeName?: string | null;
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
    profileTerms: input.profileTerms,
    pillar: input.pillar,
    placeName: input.placeName,
  });

  return {
    status: validation.approved ? "draft" : "needs_review",
    reasons: validation.reasons,
    quality: validation.quality,
  };
};

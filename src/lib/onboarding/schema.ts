import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);
const optionalText = z.string().trim().optional().or(z.literal(""));
const optionalTextArray = z.array(z.string().trim().min(1)).optional();

export const onboardingProfileSchema = z.object({
  companyName: nonEmptyText,
  fullName: nonEmptyText,
  countryCode: z.string().trim().length(2),
});

export const onboardingBrandingSchema = z.object({
  targetAudience: nonEmptyText,
  brandVoice: nonEmptyText,
  keyMessages: z.array(nonEmptyText).min(1),
});

export const onboardingMediaSchema = z.object({
  logoUrl: z.string().url().optional().or(z.literal("")),
  mediaMode: z.enum(["ai_only", "hybrid", "owned_only"]),
});

export const onboardingChannelsSchema = z.object({
  channels: z.array(z.enum(["facebook", "instagram", "linkedin", "tiktok"])).min(1),
});

export const onboardingWizardSchema = z.object({
  companyName: optionalText.or(nonEmptyText),
  fullName: optionalText.or(nonEmptyText),
  countryCode: z.string().trim().min(1).max(5).default("NO"),
  targetAudience: optionalText.or(nonEmptyText),
  brandVoice: optionalText.or(nonEmptyText),
  keyMessages: z.array(z.string().trim().min(1)).optional().default([]),
  logoUrl: z.string().url().optional().or(z.literal("")),
  mediaMode: z.enum(["ai_only", "hybrid", "owned_only"]).default("hybrid"),
  channels: z.array(z.enum(["facebook", "instagram", "linkedin", "tiktok"])).optional().default([]),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  companyDescription: optionalText,
  industry: optionalText,
  foundedYear: optionalText,
  teamDescription: optionalText,
  coreValues: optionalTextArray,
  customerPainPoints: optionalTextArray,
  customerSuccessStories: optionalTextArray,
  products: optionalTextArray,
  services: optionalTextArray,
  uniqueSellingPoints: optionalTextArray,
  priceRange: optionalText,
  brandPersonality: optionalText,
  brandDosAndDonts: optionalText,
  competitorDifferentiators: optionalText,
  commonQuestions: optionalTextArray,
  seasonalFocus: optionalText,
  tagline: optionalText,
  slogan: optionalText,
  brandColors: z.object({
    primary: optionalText,
    secondary: optionalText,
    accent: optionalText,
  }).optional().default({}),
  fontStyle: optionalText,
});

export type OnboardingWizardSchema = z.infer<typeof onboardingWizardSchema>;

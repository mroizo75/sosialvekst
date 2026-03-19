import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);

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
  channels: z.array(z.enum(["facebook", "instagram", "linkedin"])).min(1),
});

export const onboardingWizardSchema = onboardingProfileSchema
  .merge(onboardingBrandingSchema)
  .merge(onboardingMediaSchema)
  .merge(onboardingChannelsSchema)
  .extend({
    websiteUrl: z.string().url().optional().or(z.literal("")),
    companyDescription: z.string().trim().optional(),
    products: z.array(z.string().trim().min(1)).optional(),
    uniqueSellingPoints: z.array(z.string().trim().min(1)).optional(),
  });

export type OnboardingWizardSchema = z.infer<typeof onboardingWizardSchema>;

import type { BrandProfileSuggestion } from "@/lib/scraping/analyzer";
import type { BrandColors } from "@/lib/types";

export const SUGGESTION_COLUMNS = {
  companyDescription: "company_description",
  industry: "industry",
  foundedYear: "founded_year",
  teamDescription: "team_description",
  products: "products",
  services: "services",
  uniqueSellingPoints: "unique_selling_points",
  priceRange: "price_range",
  competitorDifferentiators: "competitor_differentiators",
  targetAudience: "target_audience",
  brandVoice: "brand_voice",
  brandPersonality: "brand_personality",
  keyMessages: "key_messages",
  coreValues: "core_values",
  customerPainPoints: "customer_pain_points",
  commonQuestions: "common_questions",
  seasonalFocus: "seasonal_focus",
  tagline: "tagline",
} as const satisfies Record<keyof BrandProfileSuggestion, string>;

export const PROFILE_MERGE_COLUMNS = [...Object.values(SUGGESTION_COLUMNS), "logo_url", "brand_colors"] as const;

export type ExistingProfile = Partial<Record<(typeof PROFILE_MERGE_COLUMNS)[number], unknown>>;

const isEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

const hasBrandColor = (value: unknown): boolean =>
  Boolean(value && typeof value === "object" && typeof (value as BrandColors).primary === "string" && (value as BrandColors).primary);

export type ScrapedExtras = {
  websiteUrl: string;
  websiteContent: string;
  brandColors?: BrandColors;
  logoUrl?: string;
};

// Only empty fields are filled, so anything the business wrote or corrected itself is kept.
export const buildProfileUpdate = (
  existing: ExistingProfile | null,
  suggestion: BrandProfileSuggestion,
  extras: ScrapedExtras,
): Record<string, unknown> => {
  const update: Record<string, unknown> = {
    website_url: extras.websiteUrl,
    website_content: extras.websiteContent,
  };
  for (const [field, column] of Object.entries(SUGGESTION_COLUMNS) as Array<[keyof BrandProfileSuggestion, string]>) {
    const value = suggestion[field];
    if (!isEmpty(value) && isEmpty(existing?.[column as keyof ExistingProfile])) update[column] = value;
  }
  if (extras.brandColors && !hasBrandColor(existing?.brand_colors)) update.brand_colors = extras.brandColors;
  if (extras.logoUrl && isEmpty(existing?.logo_url)) update.logo_url = extras.logoUrl;
  return update;
};

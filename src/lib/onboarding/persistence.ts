import { toAppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OnboardingWizardSchema } from "@/lib/onboarding/schema";

export const persistOnboarding = async (userId: string, payload: OnboardingWizardSchema) => {
  const supabase = await createSupabaseServerClient();

  const profileUpsert = await supabase.from("profiles").upsert(
    {
      user_id: userId,
      full_name: payload.fullName,
      company_name: payload.companyName,
      country_code: payload.countryCode.toUpperCase(),
      preferred_language: "nb-NO",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (profileUpsert.error) {
    throw toAppError("PROFILE_SAVE_FAILED", "Kunne ikke lagre profil", profileUpsert.error.message);
  }

  const brandUpsert = await supabase.from("brand_profiles").upsert(
    {
      user_id: userId,
      target_audience: payload.targetAudience,
      brand_voice: payload.brandVoice,
      key_messages: payload.keyMessages,
      logo_url: payload.logoUrl || null,
      website_url: payload.websiteUrl || null,
      company_description: payload.companyDescription || null,
      industry: payload.industry || null,
      founded_year: payload.foundedYear || null,
      team_description: payload.teamDescription || null,
      core_values: payload.coreValues ?? [],
      customer_pain_points: payload.customerPainPoints ?? [],
      customer_success_stories: payload.customerSuccessStories ?? [],
      products: payload.products ?? [],
      services: payload.services ?? [],
      unique_selling_points: payload.uniqueSellingPoints ?? [],
      price_range: payload.priceRange || null,
      brand_personality: payload.brandPersonality || null,
      brand_dos_and_donts: payload.brandDosAndDonts || null,
      competitor_differentiators: payload.competitorDifferentiators || null,
      common_questions: payload.commonQuestions ?? [],
      seasonal_focus: payload.seasonalFocus || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (brandUpsert.error) {
    throw toAppError("BRAND_SAVE_FAILED", "Kunne ikke lagre branding", brandUpsert.error.message);
  }
};

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
      products: payload.products ?? [],
      unique_selling_points: payload.uniqueSellingPoints ?? [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (brandUpsert.error) {
    throw toAppError("BRAND_SAVE_FAILED", "Kunne ikke lagre branding", brandUpsert.error.message);
  }
};

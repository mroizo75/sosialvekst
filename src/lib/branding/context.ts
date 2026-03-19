import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BrandContext } from "@/lib/types";

type ProfileRow = {
  company_name: string | null;
};

type BrandProfileRow = {
  target_audience: string | null;
  brand_voice: string | null;
  key_messages: string[] | null;
  logo_url: string | null;
  website_url: string | null;
  website_content: string | null;
  company_description: string | null;
  products: string[] | null;
  unique_selling_points: string[] | null;
};

export const getBrandContext = async (userId: string): Promise<BrandContext> => {
  const supabase = await createSupabaseServerClient();

  const [profileResult, brandResult] = await Promise.all([
    supabase.from("profiles").select("company_name").eq("user_id", userId).maybeSingle(),
    supabase
      .from("brand_profiles")
      .select(
        "target_audience, brand_voice, key_messages, logo_url, website_url, website_content, company_description, products, unique_selling_points",
      )
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const profile = profileResult.data as ProfileRow | null;
  const brand = brandResult.data as BrandProfileRow | null;

  return {
    companyName: profile?.company_name ?? undefined,
    targetAudience: brand?.target_audience ?? undefined,
    brandVoice: brand?.brand_voice ?? undefined,
    keyMessages: Array.isArray(brand?.key_messages) ? brand.key_messages : undefined,
    logoUrl: brand?.logo_url ?? undefined,
    websiteUrl: brand?.website_url ?? undefined,
    websiteContent: brand?.website_content ?? undefined,
    companyDescription: brand?.company_description ?? undefined,
    products: Array.isArray(brand?.products) ? brand.products : undefined,
    uniqueSellingPoints: Array.isArray(brand?.unique_selling_points)
      ? brand.unique_selling_points
      : undefined,
  };
};

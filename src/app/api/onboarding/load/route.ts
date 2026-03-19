import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const normalizeR2Url = (url: string | null): string => {
  if (!url) return "";
  const publicBase = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (!publicBase) return url;
  if (url.startsWith(publicBase)) return url;

  const match = url.match(/\/users\/.+$/);
  if (!match) return url;
  return `${publicBase}${match[0]}`;
};

export async function GET() {
  try {
    const userId = await requireUserId();
    const supabase = await createSupabaseServerClient();

    const [profileResult, brandResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, company_name, country_code")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("brand_profiles")
        .select("target_audience, brand_voice, key_messages, logo_url, website_url, website_content, company_description, products, unique_selling_points")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (profileResult.error) {
      return NextResponse.json(
        toAppError("PROFILE_LOAD_FAILED", "Kunne ikke hente profil", profileResult.error.message),
        { status: 500 },
      );
    }

    if (brandResult.error) {
      return NextResponse.json(
        toAppError("BRAND_LOAD_FAILED", "Kunne ikke hente branding", brandResult.error.message),
        { status: 500 },
      );
    }

    const profile = profileResult.data;
    const brand = brandResult.data;

    return NextResponse.json({
      exists: Boolean(profile),
      companyName: profile?.company_name ?? "",
      fullName: profile?.full_name ?? "",
      countryCode: profile?.country_code ?? "NO",
      targetAudience: brand?.target_audience ?? "",
      brandVoice: brand?.brand_voice ?? "",
      keyMessages: (brand?.key_messages as string[] | null) ?? [],
      logoUrl: normalizeR2Url(brand?.logo_url ?? null),
      websiteUrl: brand?.website_url ?? "",
      companyDescription: brand?.company_description ?? "",
      products: (brand?.products as string[] | null) ?? [],
      uniqueSellingPoints: (brand?.unique_selling_points as string[] | null) ?? [],
    });
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("ONBOARDING_LOAD_FAILED", "Kunne ikke laste onboarding-data", appError),
      { status: 400 },
    );
  }
}

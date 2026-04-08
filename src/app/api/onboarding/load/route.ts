import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";
import type { MediaMode, SocialChannel } from "@/lib/types";

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
    const workspaceId = await requireWorkspaceId(userId);
    const supabase = await createSupabaseServerClient();

    const [profileResult, brandResult, planResult, workspaceResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, company_name, country_code")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("brand_profiles")
        .select("target_audience, brand_voice, key_messages, logo_url, website_url, website_content, company_description, products, unique_selling_points, industry, founded_year, team_description, core_values, customer_pain_points, customer_success_stories, services, price_range, brand_personality, brand_dos_and_donts, competitor_differentiators, common_questions, seasonal_focus, tagline, slogan, brand_colors, font_style")
        .eq("user_id", userId)
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabase
        .from("content_plans")
        .select("*")
        .eq("user_id", userId)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("workspaces")
        .select("name")
        .eq("id", workspaceId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (profileResult.error) {
      console.error("[onboarding/load] profile query failed:", profileResult.error.message, profileResult.error.code);
    }

    if (brandResult.error) {
      console.error("[onboarding/load] brand query failed:", brandResult.error.message, brandResult.error.code);
    }

    if (planResult.error) {
      console.error("[onboarding/load] plan query failed:", planResult.error.message);
    }

    if (workspaceResult.error) {
      console.error("[onboarding/load] workspace query failed:", workspaceResult.error.message);
    }

    const profile = profileResult.data;
    const brand = brandResult.data;
    const latestPlan = planResult.data as { media_mode?: unknown; channels?: unknown } | null;
    const channels = Array.isArray(latestPlan?.channels)
      ? (latestPlan?.channels as unknown[])
        .filter((item): item is string => typeof item === "string")
        .filter((item): item is SocialChannel => item === "facebook" || item === "instagram" || item === "linkedin" || item === "tiktok")
      : [];

    const validModes: string[] = ["ai_only", "hybrid", "owned_only"];
    const planMediaMode = typeof latestPlan?.media_mode === "string" && validModes.includes(latestPlan.media_mode as string)
      ? (latestPlan.media_mode as MediaMode)
      : null;
    const mediaMode = planMediaMode ?? "hybrid";
    const wsName = (workspaceResult.data as { name?: string } | null)?.name ?? "";
    const hasBrandProfile = Boolean(brand);
    const hasContentPlan = Boolean(latestPlan);

    return NextResponse.json({
      exists: Boolean(profile),
      hasBrandProfile,
      hasContentPlan,
      workspaceName: wsName,
      companyName: hasBrandProfile ? (profile?.company_name ?? "") : wsName,
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
      industry: (brand as Record<string, unknown>)?.industry ?? "",
      foundedYear: (brand as Record<string, unknown>)?.founded_year ?? "",
      teamDescription: (brand as Record<string, unknown>)?.team_description ?? "",
      coreValues: ((brand as Record<string, unknown>)?.core_values as string[] | null) ?? [],
      customerPainPoints: ((brand as Record<string, unknown>)?.customer_pain_points as string[] | null) ?? [],
      customerSuccessStories: ((brand as Record<string, unknown>)?.customer_success_stories as string[] | null) ?? [],
      services: ((brand as Record<string, unknown>)?.services as string[] | null) ?? [],
      priceRange: (brand as Record<string, unknown>)?.price_range ?? "",
      brandPersonality: (brand as Record<string, unknown>)?.brand_personality ?? "",
      brandDosAndDonts: (brand as Record<string, unknown>)?.brand_dos_and_donts ?? "",
      competitorDifferentiators: (brand as Record<string, unknown>)?.competitor_differentiators ?? "",
      commonQuestions: ((brand as Record<string, unknown>)?.common_questions as string[] | null) ?? [],
      seasonalFocus: (brand as Record<string, unknown>)?.seasonal_focus ?? "",
      tagline: (brand as Record<string, unknown>)?.tagline ?? "",
      slogan: (brand as Record<string, unknown>)?.slogan ?? "",
      brandColors: (brand as Record<string, unknown>)?.brand_colors ?? {},
      fontStyle: (brand as Record<string, unknown>)?.font_style ?? "",
      mediaMode,
      channels: channels.length > 0 ? channels : ["facebook", "instagram", "linkedin", "tiktok"],
    });
  } catch (error) {
    console.error("[onboarding/load] unhandled error:", error);
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("ONBOARDING_LOAD_FAILED", "Kunne ikke laste onboarding-data", appError),
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { analyzeWebsiteContent } from "@/lib/scraping/analyzer";
import { crawlWebsite } from "@/lib/scraping/crawler";
import { fetchFacebookPageSummary } from "@/lib/scraping/facebookPage";
import { importLogoFromWebsite } from "@/lib/scraping/logoImport";
import { buildProfileUpdate, PROFILE_MERGE_COLUMNS, type ExistingProfile } from "@/lib/scraping/profileMerge";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";

const scrapeSchema = z.object({
  url: z.string().url("Ugyldig URL"),
  companyName: z.string().trim().min(1),
});

const WEBSITE_CONTENT_CHARS = 1500;

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const workspaceId = await requireWorkspaceId(userId);
    const { url, companyName } = scrapeSchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();

    const { data: existingRow, error: existingError } = await supabase
      .from("brand_profiles")
      .select(["id", ...PROFILE_MERGE_COLUMNS].join(", "))
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (existingError) {
      return NextResponse.json(
        toAppError("SCRAPE_READ_FAILED", "Kunne ikke lese bedriftsprofilen", existingError.message),
        { status: 500 },
      );
    }
    const existing = existingRow as (ExistingProfile & { id: string }) | null;

    const [crawl, facebookSummary] = await Promise.all([
      crawlWebsite(url),
      fetchFacebookPageSummary(supabase, userId, workspaceId),
    ]);
    const homepage = crawl.pages[0]?.parsed;

    const [suggestion, logoUrl] = await Promise.all([
      analyzeWebsiteContent({ companyName, pages: crawl.pages, facebookSummary }),
      existing?.logo_url ? Promise.resolve(undefined) : importLogoFromWebsite(userId, crawl.logoCandidates),
    ]);

    const websiteContent = [homepage?.title, homepage?.metaDescription, homepage?.content.slice(0, WEBSITE_CONTENT_CHARS)]
      .filter(Boolean)
      .join(" | ");

    if (existing?.id) {
      const update = buildProfileUpdate(existing, suggestion, {
        websiteUrl: crawl.finalUrl,
        websiteContent,
        brandColors: crawl.brandColors,
        logoUrl,
      });
      const { error: saveError } = await supabase
        .from("brand_profiles")
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (saveError) {
        return NextResponse.json(
          toAppError("SCRAPE_SAVE_FAILED", "Kunne ikke lagre analyseresultat", saveError.message),
          { status: 500 },
        );
      }
    }

    logger.info("Bedriftsprofil analysert", {
      userId,
      workspaceId,
      pages: crawl.pages.length,
      facebook: Boolean(facebookSummary),
      logo: Boolean(logoUrl),
      colors: Boolean(crawl.brandColors),
    });

    return NextResponse.json({
      ...suggestion,
      websiteUrl: crawl.finalUrl,
      websiteTitle: homepage?.organization?.name ?? homepage?.title,
      brandColors: crawl.brandColors ?? null,
      logoUrl: logoUrl ?? null,
      sources: { pages: crawl.pages.map((page) => page.url), facebook: Boolean(facebookSummary) },
    });
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("SCRAPE_ERROR", "Feil under nettside-analyse", appError),
      { status: 400 },
    );
  }
}

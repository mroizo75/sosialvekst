import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { graphApiVersion } from "@/lib/metrics/metaGraph";

const PAGE_FIELDS = ["name", "about", "description", "category", "mission", "company_overview", "products", "general_info", "founded", "website"];
const MAX_FIELD_CHARS = 1200;

type PageRow = { account_id: string | null; access_token: string | null };

export const formatFacebookPage = (page: Record<string, unknown>): string | undefined => {
  const labels: Record<string, string> = {
    name: "Navn",
    category: "Kategori",
    about: "Om",
    description: "Beskrivelse",
    mission: "Misjon",
    company_overview: "Bedriftsoversikt",
    products: "Produkter",
    general_info: "Generell info",
    founded: "Grunnlagt",
    website: "Nettside",
  };
  const lines = Object.entries(labels)
    .map(([field, label]) => {
      const value = page[field];
      return typeof value === "string" && value.trim() ? `${label}: ${value.trim().slice(0, MAX_FIELD_CHARS)}` : undefined;
    })
    .filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : undefined;
};

// Uses the page connected to this workspace; analysis must still work when no page is connected or the token is stale.
export const fetchFacebookPageSummary = async (
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<string | undefined> => {
  const { data, error } = await supabase
    .from("social_accounts")
    .select("account_id, access_token")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .eq("channel", "facebook")
    .limit(1)
    .maybeSingle();
  const row = data as PageRow | null;
  if (error || !row?.account_id || !row.access_token) return undefined;

  const url = new URL(`https://graph.facebook.com/${graphApiVersion()}/${encodeURIComponent(row.account_id)}`);
  url.searchParams.set("fields", PAGE_FIELDS.join(","));
  url.searchParams.set("access_token", row.access_token);

  try {
    const response = await fetch(url.toString(), { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
    if (!response.ok) {
      logger.warn("Kunne ikke hente Facebook-side til bedriftsprofil", { userId, error: payload.error?.message ?? `HTTP ${response.status}` });
      return undefined;
    }
    return formatFacebookPage(payload);
  } catch (fetchError) {
    logger.warn("Kunne ikke hente Facebook-side til bedriftsprofil", {
      userId,
      error: fetchError instanceof Error ? fetchError.message : String(fetchError),
    });
    return undefined;
  }
};

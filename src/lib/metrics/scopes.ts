export type MetricsScopeProvider = "meta" | "linkedin" | "tiktok";

export const METRICS_SCOPES: Record<MetricsScopeProvider, string[]> = {
  meta: ["read_insights", "pages_read_engagement", "pages_read_user_content", "instagram_manage_insights"],
  linkedin: ["r_member_postAnalytics"],
  tiktok: ["video.list"],
};

// Providers reject the whole login when an app lacks a scope, so each one is opted in via METRICS_SCOPES=meta,linkedin,tiktok.
export const metricsScopesFor = (
  provider: MetricsScopeProvider,
  enabled: string | undefined = process.env.METRICS_SCOPES,
): string[] => {
  const providers = (enabled ?? "").split(",").map((value) => value.trim().toLowerCase());
  return providers.includes(provider) ? METRICS_SCOPES[provider] : [];
};

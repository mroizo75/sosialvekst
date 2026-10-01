import { fetchFacebookMetrics } from "@/lib/metrics/facebook";
import { fetchInstagramMetrics } from "@/lib/metrics/instagram";
import { fetchLinkedInMetrics } from "@/lib/metrics/linkedin";
import { fetchTikTokMetrics } from "@/lib/metrics/tiktok";
import type { MetricsChannel, MetricsFetcher } from "@/lib/metrics/types";

export const METRICS_FETCHERS: Record<MetricsChannel, MetricsFetcher> = {
  facebook: fetchFacebookMetrics,
  instagram: fetchInstagramMetrics,
  linkedin: fetchLinkedInMetrics,
  tiktok: fetchTikTokMetrics,
};

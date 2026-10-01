import { readInsightValues, type GraphInsightsPayload } from "@/lib/metrics/facebook";
import { metaGet } from "@/lib/metrics/metaGraph";
import { emptyMetrics, metricsApiError, missingPermission, type MetricsFetcher, type PostMetrics } from "@/lib/metrics/types";

const INSTAGRAM_FULL = "views,reach,likes,comments,shares,saved";
const INSTAGRAM_BASIC = "reach,likes,comments,saved";

export const normalizeInstagramMetrics = (insights: GraphInsightsPayload): PostMetrics => {
  const values = readInsightValues(insights);
  return {
    ...emptyMetrics(),
    views: values.views ?? 0,
    reach: values.reach ?? 0,
    likes: values.likes ?? 0,
    comments: values.comments ?? 0,
    shares: values.shares ?? 0,
    saves: values.saved ?? 0,
    raw: { insights: values },
  };
};

// Some media types reject single metrics with code 100, so retry with the set every type supports.
export const fetchInstagramMetrics: MetricsFetcher = async (externalPostId, account) => {
  for (const metric of [INSTAGRAM_FULL, INSTAGRAM_BASIC]) {
    const response = await metaGet<GraphInsightsPayload>(
      "instagram",
      `${externalPostId}/insights`,
      { metric },
      account.accessToken,
    );
    if (response.status === "missing_permission") return missingPermission(response.message);
    if (response.status === "ok") return { status: "ok", metrics: normalizeInstagramMetrics(response.payload) };
  }
  throw metricsApiError("instagram", 400, "Ingen av metrikksettene støttes for denne posten.");
};

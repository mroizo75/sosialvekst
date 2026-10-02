import { readInsightValues, type GraphInsightsPayload } from "@/lib/metrics/facebook";
import { metaGet } from "@/lib/metrics/metaGraph";
import {
  emptyMetrics,
  metricsApiError,
  missingPermission,
  toCount,
  type MetricsFetcher,
  type MetricsResult,
  type PostMetrics,
} from "@/lib/metrics/types";

const INSTAGRAM_FULL = "views,reach,likes,comments,shares,saved";
const INSTAGRAM_BASIC = "reach,likes,comments,saved";
const INSTAGRAM_PUBLIC_FIELDS = "like_count,comments_count";

type InstagramMediaPayload = { like_count?: unknown; comments_count?: unknown };

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

export const normalizeInstagramMediaFields = (media: InstagramMediaPayload): PostMetrics => ({
  ...emptyMetrics(),
  likes: toCount(media.like_count),
  comments: toCount(media.comments_count),
  raw: { source: "media_fields" },
});

// Likes and comments on the media object need no insights permission, so they still come through
// when instagram_manage_insights is missing. Views and reach stay 0, which keeps these rows out of learning.
const fetchPublicCounts = async (
  externalPostId: string,
  accessToken: string,
  limitedBy: string,
): Promise<MetricsResult> => {
  const response = await metaGet<InstagramMediaPayload>(
    "instagram",
    externalPostId,
    { fields: INSTAGRAM_PUBLIC_FIELDS },
    accessToken,
  );
  if (response.status === "missing_permission") return missingPermission(response.message);
  if (response.status === "ok") return { status: "ok", metrics: normalizeInstagramMediaFields(response.payload), limitedBy };
  throw metricsApiError("instagram", 400, "Ingen av metrikksettene støttes for denne posten.");
};

// Some media types reject single metrics with code 100, so retry with the set every type supports.
export const fetchInstagramMetrics: MetricsFetcher = async (externalPostId, account) => {
  let limitedBy = "Instagram godtok ingen av innsiktsmetrikkene for denne posten.";
  for (const metric of [INSTAGRAM_FULL, INSTAGRAM_BASIC]) {
    const response = await metaGet<GraphInsightsPayload>(
      "instagram",
      `${externalPostId}/insights`,
      { metric },
      account.accessToken,
    );
    if (response.status === "ok") return { status: "ok", metrics: normalizeInstagramMetrics(response.payload) };
    limitedBy = response.message;
    if (response.status === "missing_permission") break;
  }
  return fetchPublicCounts(externalPostId, account.accessToken, limitedBy);
};

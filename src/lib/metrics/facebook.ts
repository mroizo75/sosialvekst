import { metaGet } from "@/lib/metrics/metaGraph";
import { emptyMetrics, missingPermission, toCount, type MetricsFetcher, type PostMetrics } from "@/lib/metrics/types";

export type GraphInsightsPayload = {
  data?: Array<{
    name?: string;
    values?: Array<{ value?: unknown }>;
    total_value?: { value?: unknown };
  }>;
};

export type FacebookEngagementPayload = {
  reactions?: { summary?: { total_count?: unknown } };
  comments?: { summary?: { total_count?: unknown } };
  shares?: { count?: unknown };
};

const FACEBOOK_INSIGHTS = "post_media_view,post_total_media_view_unique";
const FACEBOOK_ENGAGEMENT = "reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares";

export const readInsightValues = (payload: GraphInsightsPayload): Record<string, number> =>
  Object.fromEntries(
    (payload.data ?? [])
      .filter((entry) => Boolean(entry.name))
      .map((entry) => [entry.name as string, toCount(entry.total_value?.value ?? entry.values?.[0]?.value)]),
  );

export const normalizeFacebookMetrics = (
  insights: GraphInsightsPayload | null,
  engagement: FacebookEngagementPayload,
): PostMetrics => {
  const values = insights ? readInsightValues(insights) : {};
  return {
    ...emptyMetrics(),
    views: values.post_media_view ?? 0,
    reach: values.post_total_media_view_unique ?? 0,
    likes: toCount(engagement.reactions?.summary?.total_count),
    comments: toCount(engagement.comments?.summary?.total_count),
    shares: toCount(engagement.shares?.count),
    raw: { insights: values },
  };
};

export const fetchFacebookMetrics: MetricsFetcher = async (externalPostId, account) => {
  const [insights, engagement] = await Promise.all([
    metaGet<GraphInsightsPayload>("facebook", `${externalPostId}/insights`, { metric: FACEBOOK_INSIGHTS }, account.accessToken),
    metaGet<FacebookEngagementPayload>("facebook", externalPostId, { fields: FACEBOOK_ENGAGEMENT }, account.accessToken),
  ]);

  if (insights.status === "missing_permission") return missingPermission(insights.message);
  if (engagement.status === "missing_permission") return missingPermission(engagement.message);

  return {
    status: "ok",
    metrics: normalizeFacebookMetrics(
      insights.status === "ok" ? insights.payload : null,
      engagement.status === "ok" ? engagement.payload : {},
    ),
  };
};

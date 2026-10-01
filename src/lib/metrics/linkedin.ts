import {
  emptyMetrics,
  metricsApiError,
  missingPermission,
  toCount,
  type MetricsFetcher,
  type MetricsResult,
  type PostMetrics,
} from "@/lib/metrics/types";

type LinkedInShareStatistics = {
  impressionCount?: unknown;
  uniqueImpressionsCount?: unknown;
  clickCount?: unknown;
  likeCount?: unknown;
  commentCount?: unknown;
  shareCount?: unknown;
};

export type LinkedInOrgStatsPayload = {
  elements?: Array<{ totalShareStatistics?: LinkedInShareStatistics }>;
};

type MemberQueryType = "IMPRESSION" | "MEMBERS_REACHED" | "REACTION" | "COMMENT" | "RESHARE";

const MEMBER_QUERY_TYPES: MemberQueryType[] = ["IMPRESSION", "MEMBERS_REACHED", "REACTION", "COMMENT", "RESHARE"];

type LinkedInResponse<T> = { status: "ok"; payload: T } | { status: "missing_permission"; message: string };

const linkedInGet = async <T>(url: string, accessToken: string): Promise<LinkedInResponse<T>> => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "LinkedIn-Version": process.env.LINKEDIN_API_VERSION ?? "202608",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (response.ok) return { status: "ok", payload };
  if (response.status === 401 || response.status === 403) {
    return { status: "missing_permission", message: payload.message ?? `HTTP ${response.status}` };
  }
  throw metricsApiError("linkedin", response.status, payload.message);
};

const isShareUrn = (postUrn: string): boolean => postUrn.startsWith("urn:li:share:");

export const normalizeLinkedInOrgMetrics = (payload: LinkedInOrgStatsPayload): PostMetrics => {
  const stats = payload.elements?.[0]?.totalShareStatistics ?? {};
  return {
    ...emptyMetrics(),
    views: toCount(stats.impressionCount),
    reach: toCount(stats.uniqueImpressionsCount),
    likes: toCount(stats.likeCount),
    comments: toCount(stats.commentCount),
    shares: toCount(stats.shareCount),
    clicks: toCount(stats.clickCount),
    raw: { totalShareStatistics: stats },
  };
};

export const normalizeLinkedInMemberMetrics = (counts: Partial<Record<MemberQueryType, number>>): PostMetrics => ({
  ...emptyMetrics(),
  views: counts.IMPRESSION ?? 0,
  reach: counts.MEMBERS_REACHED ?? 0,
  likes: counts.REACTION ?? 0,
  comments: counts.COMMENT ?? 0,
  shares: counts.RESHARE ?? 0,
  raw: { counts },
});

const fetchOrganizationMetrics = async (postUrn: string, organizationUrn: string, accessToken: string): Promise<MetricsResult> => {
  const listKey = isShareUrn(postUrn) ? "shares" : "ugcPosts";
  const url = "https://api.linkedin.com/rest/organizationalEntityShareStatistics"
    + `?q=organizationalEntity&organizationalEntity=${encodeURIComponent(organizationUrn)}`
    + `&${listKey}=List(${encodeURIComponent(postUrn)})`;
  const response = await linkedInGet<LinkedInOrgStatsPayload>(url, accessToken);
  if (response.status === "missing_permission") return missingPermission(response.message);
  return { status: "ok", metrics: normalizeLinkedInOrgMetrics(response.payload) };
};

const fetchMemberMetrics = async (postUrn: string, accessToken: string): Promise<MetricsResult> => {
  const entityKey = isShareUrn(postUrn) ? "share" : "ugc";
  const responses = await Promise.all(MEMBER_QUERY_TYPES.map(async (queryType) => {
    const url = "https://api.linkedin.com/rest/memberCreatorPostAnalytics"
      + `?q=entity&entity=(${entityKey}:${encodeURIComponent(postUrn)})`
      + `&queryType=${queryType}&aggregation=TOTAL`;
    const response = await linkedInGet<{ elements?: Array<{ count?: unknown }> }>(url, accessToken);
    return { queryType, response };
  }));

  const denied = responses.find((entry) => entry.response.status === "missing_permission");
  if (denied && denied.response.status === "missing_permission") return missingPermission(denied.response.message);

  const counts = Object.fromEntries(responses.map(({ queryType, response }) => [
    queryType,
    response.status === "ok" ? toCount(response.payload.elements?.[0]?.count) : 0,
  ]));
  return { status: "ok", metrics: normalizeLinkedInMemberMetrics(counts) };
};

export const fetchLinkedInMetrics: MetricsFetcher = async (externalPostId, account) =>
  account.accountId.startsWith("urn:li:organization:")
    ? fetchOrganizationMetrics(externalPostId, account.accountId, account.accessToken)
    : fetchMemberMetrics(externalPostId, account.accessToken);

import { toAppError } from "@/lib/errors";

export type MetricsChannel = "facebook" | "instagram" | "linkedin" | "tiktok";

export type PostMetrics = {
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  raw: Record<string, unknown>;
};

export type MetricsResult =
  | { status: "ok"; metrics: PostMetrics }
  | { status: "missing_permission"; message: string };

export type MetricsAccount = {
  accountId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  userId: string;
};

export type MetricsFetcher = (externalPostId: string, account: MetricsAccount) => Promise<MetricsResult>;

export const emptyMetrics = (): PostMetrics => ({
  views: 0,
  reach: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  saves: 0,
  clicks: 0,
  raw: {},
});

export const toCount = (value: unknown): number => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
};

export const missingPermission = (message: string): MetricsResult => ({ status: "missing_permission", message });

export const metricsApiError = (channel: MetricsChannel, status: number, details: unknown) =>
  toAppError("METRICS_API_ERROR", `Statistikk fra ${channel} svarte med HTTP ${status}`, details);

import { metricsApiError, type MetricsChannel } from "@/lib/metrics/types";

type GraphError = { message?: string; code?: number };

export type GraphResponse<T> =
  | { status: "ok"; payload: T }
  | { status: "missing_permission"; message: string }
  | { status: "invalid_metric"; message: string };

const PERMISSION_CODES = new Set([10, 190]);

export const isPermissionError = (error: GraphError | undefined): boolean => {
  if (!error?.code) return false;
  return PERMISSION_CODES.has(error.code) || (error.code >= 200 && error.code < 300);
};

export const graphApiVersion = (): string => process.env.FACEBOOK_GRAPH_API_VERSION ?? "v23.0";

export const metaGet = async <T>(
  channel: MetricsChannel,
  path: string,
  params: Record<string, string>,
  accessToken: string,
): Promise<GraphResponse<T>> => {
  const url = new URL(`https://graph.facebook.com/${graphApiVersion()}/${path}`);
  Object.entries({ ...params, access_token: accessToken }).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url.toString(), { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: GraphError };
  if (response.ok) return { status: "ok", payload };

  const message = payload.error?.message ?? `HTTP ${response.status}`;
  if (isPermissionError(payload.error)) return { status: "missing_permission", message };
  if (payload.error?.code === 100) return { status: "invalid_metric", message };
  throw metricsApiError(channel, response.status, message);
};

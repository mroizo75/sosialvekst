import {
  emptyMetrics,
  metricsApiError,
  missingPermission,
  toCount,
  type MetricsFetcher,
  type PostMetrics,
} from "@/lib/metrics/types";
import { ensureTikTokToken } from "@/workers/publishWorker";

type TikTokError = { code?: string; message?: string };

export type TikTokVideo = {
  id?: string;
  view_count?: unknown;
  like_count?: unknown;
  comment_count?: unknown;
  share_count?: unknown;
};

type TikTokResponse<T> = { status: "ok"; payload: T } | { status: "missing_permission"; message: string };

const PERMISSION_CODES = new Set(["scope_not_authorized", "access_token_invalid", "scope_permission_missed"]);

const tiktokPost = async <T>(url: string, accessToken: string, body: unknown): Promise<TikTokResponse<T>> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: TikTokError };
  const code = payload.error?.code ?? "ok";
  if (response.ok && code === "ok") return { status: "ok", payload };
  if (PERMISSION_CODES.has(code) || response.status === 401) {
    return { status: "missing_permission", message: payload.error?.message ?? code };
  }
  throw metricsApiError("tiktok", response.status, payload.error);
};

export const normalizeTikTokMetrics = (video: TikTokVideo | undefined): PostMetrics => ({
  ...emptyMetrics(),
  views: toCount(video?.view_count),
  likes: toCount(video?.like_count),
  comments: toCount(video?.comment_count),
  shares: toCount(video?.share_count),
  raw: { video: video ?? null },
});

// publish_id is stored at publish time; the public video id only exists after TikTok has processed the post.
export const fetchTikTokMetrics: MetricsFetcher = async (externalPostId, account) => {
  const accessToken = await ensureTikTokToken(account);

  const status = await tiktokPost<{ data?: { publicaly_available_post_id?: Array<string | number> } }>(
    "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
    accessToken,
    { publish_id: externalPostId },
  );
  if (status.status === "missing_permission") return missingPermission(status.message);

  const videoId = status.payload.data?.publicaly_available_post_id?.[0];
  if (!videoId) throw metricsApiError("tiktok", 404, "Posten er ikke offentlig tilgjengelig ennå.");

  const query = await tiktokPost<{ data?: { videos?: TikTokVideo[] } }>(
    "https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count",
    accessToken,
    { filters: { video_ids: [String(videoId)] } },
  );
  if (query.status === "missing_permission") return missingPermission(query.message);

  return { status: "ok", metrics: normalizeTikTokMetrics(query.payload.data?.videos?.[0]) };
};

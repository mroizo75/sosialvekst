import { logger } from "@/lib/logger";
import { dueCheckpoints, METRICS_WINDOW_MS, type MetricsCheckpoint } from "@/lib/metrics/checkpoints";
import { METRICS_FETCHERS } from "@/lib/metrics/providers";
import type { MetricsAccount, MetricsChannel } from "@/lib/metrics/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RunMetricsWorkerInput = {
  userId?: string;
  limit?: number;
};

type AccountState = { account: MetricsAccount | null; blocked: boolean };

type CompletedJob = {
  post_id: string;
  user_id: string;
  workspace_id: string;
  channel: MetricsChannel;
  external_post_id: string;
  updated_at: string;
};

const isRealExternalId = (channel: MetricsChannel, externalPostId: string): boolean =>
  Boolean(externalPostId) && !externalPostId.startsWith(`${channel}_`);

export const runMetricsWorker = async (input: RunMetricsWorkerInput = {}): Promise<{
  checked: number;
  collected: number;
  missingPermission: number;
  failed: number;
}> => {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const since = new Date(now.getTime() - METRICS_WINDOW_MS).toISOString();

  let query = admin
    .from("publish_jobs")
    .select("post_id, user_id, workspace_id, channel, external_post_id, updated_at")
    .eq("status", "completed")
    .not("external_post_id", "is", null)
    .gte("updated_at", since)
    .order("updated_at", { ascending: true })
    .limit(input.limit ?? 200);
  if (input.userId) query = query.eq("user_id", input.userId);

  const { data: jobs, error: jobsError } = await query;
  if (jobsError) throw new Error(jobsError.message);

  const candidates = ((jobs ?? []) as CompletedJob[]).filter((job) => isRealExternalId(job.channel, job.external_post_id));
  if (candidates.length === 0) return { checked: 0, collected: 0, missingPermission: 0, failed: 0 };

  const { data: existingRows, error: existingError } = await admin
    .from("post_metrics")
    .select("post_id, checkpoint")
    .in("post_id", candidates.map((job) => job.post_id));
  if (existingError) throw new Error(existingError.message);

  const existingByPost = new Map<string, MetricsCheckpoint[]>();
  (existingRows ?? []).forEach((row) => {
    existingByPost.set(row.post_id, [...(existingByPost.get(row.post_id) ?? []), row.checkpoint as MetricsCheckpoint]);
  });

  const accounts = new Map<string, AccountState>();
  const loadAccount = async (job: CompletedJob): Promise<AccountState> => {
    const key = `${job.user_id}:${job.workspace_id}:${job.channel}`;
    const cached = accounts.get(key);
    if (cached) return cached;
    const { data } = await admin
      .from("social_accounts")
      .select("account_id, access_token, refresh_token, token_expires_at")
      .eq("user_id", job.user_id)
      .eq("workspace_id", job.workspace_id)
      .eq("channel", job.channel)
      .limit(1)
      .maybeSingle();
    const state: AccountState = {
      account: data?.account_id && data.access_token
        ? {
          accountId: data.account_id,
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? null,
          tokenExpiresAt: data.token_expires_at ?? null,
          userId: job.user_id,
        }
        : null,
      blocked: false,
    };
    accounts.set(key, state);
    return state;
  };

  const setMetricsStatus = async (job: CompletedJob, status: "ok" | "missing_permission" | "error") => {
    const { error } = await admin
      .from("social_accounts")
      .update({ metrics_status: status })
      .eq("user_id", job.user_id)
      .eq("workspace_id", job.workspace_id)
      .eq("channel", job.channel);
    if (error) logger.warn("[metricsWorker] Kunne ikke oppdatere metrics_status", { channel: job.channel, error: error.message });
  };

  let checked = 0;
  let collected = 0;
  let missingPermission = 0;
  let failed = 0;

  for (const job of candidates) {
    const publishedAt = new Date(job.updated_at);
    const [checkpoint] = dueCheckpoints(publishedAt, now, existingByPost.get(job.post_id) ?? []);
    if (!checkpoint) continue;

    const state = await loadAccount(job);
    if (!state.account || state.blocked) continue;
    checked += 1;

    try {
      const result = await METRICS_FETCHERS[job.channel](job.external_post_id, state.account);
      if (result.status === "missing_permission") {
        state.blocked = true;
        missingPermission += 1;
        await setMetricsStatus(job, "missing_permission");
        logger.warn("[metricsWorker] Mangler tillatelse til statistikk", { channel: job.channel, message: result.message });
        continue;
      }

      const { error: upsertError } = await admin.from("post_metrics").upsert({
        post_id: job.post_id,
        user_id: job.user_id,
        workspace_id: job.workspace_id,
        channel: job.channel,
        checkpoint,
        published_at: publishedAt.toISOString(),
        views: result.metrics.views,
        reach: result.metrics.reach,
        likes: result.metrics.likes,
        comments: result.metrics.comments,
        shares: result.metrics.shares,
        saves: result.metrics.saves,
        clicks: result.metrics.clicks,
        raw: result.metrics.raw,
        fetched_at: now.toISOString(),
      }, { onConflict: "post_id,checkpoint" });
      if (upsertError) throw new Error(upsertError.message);

      collected += 1;
      await setMetricsStatus(job, "ok");
    } catch (error) {
      failed += 1;
      logger.error("[metricsWorker] Henting av statistikk feilet", {
        postId: job.post_id,
        channel: job.channel,
        checkpoint,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  logger.info("[metricsWorker] Ferdig", { checked, collected, missingPermission, failed });
  return { checked, collected, missingPermission, failed };
};

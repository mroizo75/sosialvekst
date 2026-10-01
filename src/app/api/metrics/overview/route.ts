import { NextResponse } from "next/server";

import { getFormatLabel } from "@/lib/ai/postStrategy";
import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  buildProfileFromSamples,
  loadPerformanceSamples,
  recommendedHours,
  scoreSamples,
  type PerformanceProfile,
  type PerformanceSample,
} from "@/lib/metrics/learning";
import type { MetricsChannel } from "@/lib/metrics/types";
import { timeZoneForCountry } from "@/lib/schedule/audienceTime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PostFormat } from "@/lib/types";
import { requireWorkspaceId } from "@/lib/workspace";

const CHANNELS: MetricsChannel[] = ["facebook", "instagram", "linkedin", "tiktok"];
const POST_LIMIT = 40;

type AccountRow = { channel: MetricsChannel; metrics_status?: string | null };

const loadAccounts = async (
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  workspaceId: string,
): Promise<AccountRow[]> => {
  const withStatus = await supabase
    .from("social_accounts")
    .select("channel, metrics_status")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId);
  if (!withStatus.error) return (withStatus.data ?? []) as AccountRow[];

  const plain = await supabase
    .from("social_accounts")
    .select("channel")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId);
  if (plain.error) throw new Error(plain.error.message);
  return (plain.data ?? []) as AccountRow[];
};

const topWeights = (weights: Record<string, number>, limit: number) =>
  Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, weight]) => ({ key, weight }));

const formatLabel = (format: string | undefined): string | null =>
  format ? getFormatLabel(format as PostFormat) ?? null : null;

export async function GET() {
  try {
    const userId = await requireUserId();
    const workspaceId = await requireWorkspaceId(userId);
    const supabase = await createSupabaseServerClient();
    const timeZone = timeZoneForCountry("NO");

    const accounts = await loadAccounts(supabase, userId, workspaceId);
    const channels = CHANNELS.filter((channel) => accounts.some((account) => account.channel === channel));

    let setupMissing = false;
    const perChannel = await Promise.all(channels.map(async (channel) => {
      try {
        const samples = await loadPerformanceSamples(supabase, { userId, workspaceId }, channel);
        return { channel, samples, profile: buildProfileFromSamples(channel, samples, timeZone) };
      } catch (error) {
        setupMissing = true;
        logger.warn("[metrics/overview] Statistikk utilgjengelig", {
          channel,
          error: error instanceof Error ? error.message : error,
        });
        return { channel, samples: [] as PerformanceSample[], profile: null as PerformanceProfile | null };
      }
    }));

    const scored = perChannel.flatMap(({ channel, samples }) =>
      scoreSamples(samples).map((sample) => ({ ...sample, channel })));
    const recent = [...scored].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()).slice(0, POST_LIMIT);

    const { data: postRows } = recent.length > 0
      ? await supabase.from("posts").select("id, image_url, text_content").in("id", recent.map((sample) => sample.postId))
      : { data: [] };
    const postById = new Map((postRows ?? []).map((row) => [row.id as string, row]));

    const { data: draftRows } = await supabase
      .from("posts")
      .select("id, channel, scheduled_at")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .in("status", ["draft", "needs_review"])
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true });
    const nextDraftByChannel = Object.fromEntries(channels.map((channel) => [
      channel,
      (draftRows ?? []).find((row) => row.channel === channel)?.id ?? null,
    ]));

    const formatCounts = new Map(perChannel.map(({ channel, samples }) => [channel, {
      reel: samples.filter((sample) => sample.mediaFormat === "reel").length,
      image: samples.filter((sample) => sample.mediaFormat !== "reel").length,
    }]));
    const profiles = perChannel.flatMap(({ profile }) => (profile ? [profile] : []));
    const hourScores = new Map<number, number>();
    profiles.forEach((profile) => {
      recommendedHours(profile).forEach((hour) => {
        hourScores.set(hour, Math.max(hourScores.get(hour) ?? 0, profile.hours[String(hour)] ?? 0));
      });
    });

    return NextResponse.json({
      setupMissing,
      recommendedHours: [...hourScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([hour]) => hour).sort((a, b) => a - b),
      accounts: accounts.map((account) => ({ channel: account.channel, metricsStatus: account.metrics_status ?? "ok" })),
      profiles: profiles.map((profile) => ({
        channel: profile.channel,
        sampleSize: profile.sampleSize,
        ready: profile.ready,
        bestFormats: topWeights(profile.formats, 3).map((entry) => ({ ...entry, label: formatLabel(entry.key) ?? entry.key })),
        bestHours: recommendedHours(profile),
        reelVsImage: {
          reel: profile.mediaFormats.reel ?? null,
          image: profile.mediaFormats.image ?? null,
          reelCount: formatCounts.get(profile.channel)?.reel ?? 0,
          imageCount: formatCounts.get(profile.channel)?.image ?? 0,
        },
      })),
      posts: recent.map((sample) => {
        const row = postById.get(sample.postId);
        const firstLine = String(row?.text_content ?? "").split("\n").map((line) => line.trim()).find(Boolean) ?? "";
        return {
          postId: sample.postId,
          channel: sample.channel,
          publishedAt: sample.publishedAt.toISOString(),
          title: sample.meta?.coverTitle ?? firstLine.slice(0, 120),
          formatLabel: formatLabel(sample.meta?.format),
          mediaFormat: sample.mediaFormat ?? "image",
          imageUrl: (row?.image_url as string | null) ?? null,
          hasMeta: Boolean(sample.meta),
          views: sample.counts.views,
          reach: sample.counts.reach,
          likes: sample.counts.likes,
          comments: sample.counts.comments,
          shares: sample.counts.shares,
          saves: sample.counts.saves,
          relative: Number(sample.relative.toFixed(2)),
        };
      }),
      nextDraftByChannel,
    });
  } catch (error) {
    return NextResponse.json(
      toAppError("METRICS_OVERVIEW_FAILED", "Kunne ikke hente statistikk.", toUnknownAppError(error)),
      { status: 500 },
    );
  }
}

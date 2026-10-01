import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import type { MetricsCheckpoint } from "@/lib/metrics/checkpoints";
import { EXPLORE_RATE, MIN_PROFILE_SAMPLES } from "@/lib/metrics/constants";
import type { MetricsChannel } from "@/lib/metrics/types";
import type { GenerationMeta, MediaFormat } from "@/lib/types";

const SHRINKAGE = 2;
const PROFILE_LOOKBACK_DAYS = 180;
const CHECKPOINT_RANK: Record<MetricsCheckpoint, number> = { "24h": 0, "72h": 1, "7d": 2 };

export type EngagementCounts = {
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
};

export type ProfileScope = { userId: string; workspaceId: string };

export type PerformanceSample = {
  postId: string;
  publishedAt: Date;
  counts: EngagementCounts;
  meta: GenerationMeta | null;
  mediaFormat?: MediaFormat;
};

export type ScoredSample = PerformanceSample & { score: number; relative: number };

export type PerformanceProfile = {
  channel: MetricsChannel;
  sampleSize: number;
  ready: boolean;
  medianScore: number;
  styles: Record<string, number>;
  formats: Record<string, number>;
  pillars: Record<string, number>;
  motifs: Record<string, number>;
  mediaFormats: Record<string, number>;
  hours: Record<string, number>;
  weekdays: Record<string, number>;
  topTitles: string[];
  weakTitles: string[];
  topHooks: string[];
};

export const engagementScore = (counts: EngagementCounts): number | null => {
  const audience = counts.views > 0 ? counts.views : counts.reach;
  if (audience <= 0) return null;
  return (counts.likes + 2 * counts.comments + 3 * counts.shares + 3 * counts.saves) / audience;
};

export const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const localParts = (value: Date, timeZone: string): { weekday: string; hour: string } => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(value);
  return {
    weekday: parts.find((part) => part.type === "weekday")?.value ?? "",
    hour: String(Number(parts.find((part) => part.type === "hour")?.value ?? "0")),
  };
};

// Averages relative scores per key and pulls small groups towards 1 so a single lucky post does not dominate.
const weightBy = (samples: ScoredSample[], keyOf: (sample: ScoredSample) => string | undefined): Record<string, number> => {
  const groups = new Map<string, number[]>();
  samples.forEach((sample) => {
    const key = keyOf(sample);
    if (!key) return;
    groups.set(key, [...(groups.get(key) ?? []), sample.relative]);
  });
  return Object.fromEntries(
    [...groups.entries()].map(([key, values]) => [
      key,
      Number(((values.reduce((sum, value) => sum + value, 0) + SHRINKAGE) / (values.length + SHRINKAGE)).toFixed(3)),
    ]),
  );
};

export const scoreSamples = (samples: PerformanceSample[]): ScoredSample[] => {
  const scored = samples
    .map((sample) => ({ sample, score: engagementScore(sample.counts) }))
    .filter((entry): entry is { sample: PerformanceSample; score: number } => entry.score !== null);
  const baseline = median(scored.map((entry) => entry.score));
  return scored.map(({ sample, score }) => ({
    ...sample,
    score,
    relative: baseline > 0 ? score / baseline : 1,
  }));
};

export const buildProfileFromSamples = (
  channel: MetricsChannel,
  samples: PerformanceSample[],
  timeZone: string,
): PerformanceProfile => {
  const scored = scoreSamples(samples);
  const ranked = [...scored].sort((a, b) => b.relative - a.relative);
  const titled = ranked.filter((sample) => sample.meta?.coverTitle);

  return {
    channel,
    sampleSize: scored.length,
    ready: scored.length >= MIN_PROFILE_SAMPLES,
    medianScore: median(scored.map((sample) => sample.score)),
    styles: weightBy(scored, (sample) => sample.meta?.style),
    formats: weightBy(scored, (sample) => sample.meta?.format),
    pillars: weightBy(scored, (sample) => sample.meta?.pillar),
    motifs: weightBy(scored, (sample) => sample.meta?.motif),
    mediaFormats: weightBy(scored, (sample) => sample.mediaFormat ?? sample.meta?.mediaFormat),
    hours: weightBy(scored, (sample) => localParts(sample.publishedAt, timeZone).hour),
    weekdays: weightBy(scored, (sample) => localParts(sample.publishedAt, timeZone).weekday),
    topTitles: titled.slice(0, 3).map((sample) => sample.meta?.coverTitle as string),
    weakTitles: titled.length >= 5 ? titled.slice(-2).map((sample) => sample.meta?.coverTitle as string) : [],
    topHooks: ranked.map((sample) => sample.meta?.hook).filter((hook): hook is string => Boolean(hook)).slice(0, 3),
  };
};

// 70 % of picks follow the measured weights, 30 % stay uniform so new forms keep getting tested.
export const pickWeighted = <T extends string>(
  candidates: readonly T[],
  weights: Record<string, number> | undefined,
  random: () => number = Math.random,
): T => {
  if (candidates.length === 0) throw new Error("pickWeighted krever minst ett alternativ.");
  if (!weights || random() < EXPLORE_RATE) {
    return candidates[Math.floor(random() * candidates.length) % candidates.length];
  }
  const scores = candidates.map((candidate) => Math.max(weights[candidate] ?? 1, 0.05));
  const total = scores.reduce((sum, value) => sum + value, 0);
  let target = random() * total;
  for (let index = 0; index < candidates.length; index += 1) {
    target -= scores[index];
    if (target <= 0) return candidates[index];
  }
  return candidates[candidates.length - 1];
};

export const recommendedHours = (profile: PerformanceProfile | null, limit = 3): number[] => {
  if (!profile?.ready) return [];
  return Object.entries(profile.hours)
    .filter(([, weight]) => weight > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([hour]) => Number(hour))
    .sort((a, b) => a - b);
};

const bestKeys = (weights: Record<string, number>, limit: number): string[] =>
  Object.entries(weights)
    .filter(([, weight]) => weight > 1.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);

export const profilePromptLines = (profile: PerformanceProfile | null | undefined): string[] => {
  if (!profile?.ready) return [];
  const lines: string[] = [];
  const styles = bestKeys(profile.styles, 2);
  const formats = bestKeys(profile.formats, 2);
  if (styles.length || formats.length) {
    lines.push(`Dette har fungert for denne kontoen: ${[...styles, ...formats].join(", ")} gir mest engasjement.`);
  }
  if (profile.topTitles.length) {
    lines.push(`Titler som har gitt mest engasjement (bruk tonen, ikke kopier ordrett): ${profile.topTitles.map((title) => `«${title}»`).join(", ")}.`);
  }
  if (profile.weakTitles.length) {
    lines.push(`Titler som ga lite engasjement (unngå samme vinkel): ${profile.weakTitles.map((title) => `«${title}»`).join(", ")}.`);
  }
  return lines;
};

type MetricsRow = {
  post_id: string;
  checkpoint: MetricsCheckpoint;
  published_at: string;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
};

export const latestPerPost = (rows: MetricsRow[]): MetricsRow[] => {
  const byPost = new Map<string, MetricsRow>();
  rows.forEach((row) => {
    const current = byPost.get(row.post_id);
    if (!current || CHECKPOINT_RANK[row.checkpoint] > CHECKPOINT_RANK[current.checkpoint]) byPost.set(row.post_id, row);
  });
  return [...byPost.values()];
};

export const loadPerformanceSamples = async (
  supabase: SupabaseClient,
  scope: ProfileScope,
  channel: MetricsChannel,
): Promise<PerformanceSample[]> => {
  const since = new Date(Date.now() - PROFILE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: metricRows, error } = await supabase
    .from("post_metrics")
    .select("post_id, checkpoint, published_at, views, reach, likes, comments, shares, saves")
    .eq("user_id", scope.userId)
    .eq("workspace_id", scope.workspaceId)
    .eq("channel", channel)
    .gte("published_at", since);
  if (error) throw new Error(error.message);

  const latest = latestPerPost((metricRows ?? []) as MetricsRow[]);
  if (latest.length === 0) return [];

  const { data: postRows, error: postError } = await supabase
    .from("posts")
    .select("id, generation_meta, video_url")
    .in("id", latest.map((row) => row.post_id));
  if (postError) throw new Error(postError.message);

  const postById = new Map((postRows ?? []).map((row) => [row.id as string, {
    meta: (row.generation_meta ?? null) as GenerationMeta | null,
    mediaFormat: (row.video_url ? "reel" : "image") as MediaFormat,
  }]));
  return latest.map((row) => ({
    postId: row.post_id,
    publishedAt: new Date(row.published_at),
    counts: row,
    meta: postById.get(row.post_id)?.meta ?? null,
    mediaFormat: postById.get(row.post_id)?.mediaFormat,
  }));
};

export const buildPerformanceProfile = async (
  supabase: SupabaseClient,
  scope: ProfileScope,
  channel: MetricsChannel,
  timeZone: string,
): Promise<PerformanceProfile> =>
  buildProfileFromSamples(channel, await loadPerformanceSamples(supabase, scope, channel), timeZone);

// Generation must keep working when statistics are unavailable, e.g. before migration 024 has run.
export const loadProfilesSafely = async (
  supabase: SupabaseClient,
  scope: ProfileScope,
  channels: readonly MetricsChannel[],
  timeZone: string,
): Promise<Map<MetricsChannel, PerformanceProfile>> => {
  const entries = await Promise.all([...new Set(channels)].map(async (channel) => {
    try {
      return [channel, await buildPerformanceProfile(supabase, scope, channel, timeZone)] as const;
    } catch (error) {
      logger.warn("[learning] Kunne ikke bygge ytelsesprofil", {
        channel,
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  }));
  return new Map(entries.filter((entry): entry is readonly [MetricsChannel, PerformanceProfile] => entry !== null));
};

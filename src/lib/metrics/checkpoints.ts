export type MetricsCheckpoint = "24h" | "72h" | "7d";

const HOUR_MS = 60 * 60 * 1000;

export const CHECKPOINT_OFFSETS: Array<{ checkpoint: MetricsCheckpoint; offsetMs: number }> = [
  { checkpoint: "24h", offsetMs: 24 * HOUR_MS },
  { checkpoint: "72h", offsetMs: 72 * HOUR_MS },
  { checkpoint: "7d", offsetMs: 7 * 24 * HOUR_MS },
];

export const METRICS_WINDOW_MS = 8 * 24 * HOUR_MS;

// Only the latest reached checkpoint is collected: numbers fetched late would be mislabelled as an earlier one.
export const dueCheckpoints = (
  publishedAt: Date,
  now: Date,
  existing: ReadonlyArray<MetricsCheckpoint>,
): MetricsCheckpoint[] => {
  const elapsed = now.getTime() - publishedAt.getTime();
  if (elapsed < 0 || elapsed > METRICS_WINDOW_MS) return [];
  const reached = CHECKPOINT_OFFSETS.filter((entry) => elapsed >= entry.offsetMs).at(-1);
  if (!reached || existing.includes(reached.checkpoint)) return [];
  return [reached.checkpoint];
};

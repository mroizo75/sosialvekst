import type { MediaFormat, ReachGoal, SocialChannel } from "@/lib/types";

// Pure so the plan dialog in the browser can show the same mix the server will generate.

export const REACH_GOALS: ReachGoal[] = ["growth", "balanced", "followers"];
export const DEFAULT_REACH_GOAL: ReachGoal = "growth";

export const toReachGoal = (value: unknown): ReachGoal =>
  typeof value === "string" && (REACH_GOALS as string[]).includes(value) ? value as ReachGoal : DEFAULT_REACH_GOAL;

// Reels are shown to people who do not follow the page; images mostly reach existing followers.
// growth: every Facebook/Instagram post is a reel. balanced: every other post. followers: images.
// TikTok is video only, so it is always a reel. LinkedIn stays a still image.
export const chooseMediaFormat = (
  channel: SocialChannel,
  feedIndex: number,
  reelsAllowed: boolean,
  pinned?: MediaFormat,
  reachGoal: ReachGoal = DEFAULT_REACH_GOAL,
): MediaFormat => {
  if (!reelsAllowed) return "image";
  if (pinned) return pinned;
  if (channel === "linkedin") return "image";
  if (channel === "tiktok") return "reel";
  if (reachGoal === "followers") return "image";
  if (reachGoal === "balanced") return feedIndex % 2 === 0 ? "reel" : "image";
  return "reel";
};

// Whether a post would become a reel if credits allow; used to show the plan before it is generated.
export const plannedMediaFormat = (channel: SocialChannel, feedIndex: number, reachGoal: ReachGoal): MediaFormat =>
  chooseMediaFormat(channel, feedIndex, true, undefined, reachGoal);

export type PlannedMix = { reels: number; images: number };

// Mirrors the feed index the plan generator uses: week * posts per week + day.
export const plannedMix = (
  channels: SocialChannel[],
  postsPerWeek: number,
  weeks: number,
  reachGoal: ReachGoal,
): PlannedMix => {
  let reels = 0;
  let images = 0;
  for (let week = 0; week < weeks; week += 1) {
    for (let day = 0; day < postsPerWeek; day += 1) {
      for (const channel of channels) {
        if (plannedMediaFormat(channel, week * postsPerWeek + day, reachGoal) === "reel") reels += 1;
        else images += 1;
      }
    }
  }
  return { reels, images };
};

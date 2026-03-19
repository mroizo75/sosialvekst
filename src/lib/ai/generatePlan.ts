import { generatePost } from "@/lib/ai/generatePost";
import { assignPostStrategy } from "@/lib/ai/postStrategy";
import type { BrandContext, MediaMode, PostDraft, SocialChannel, TopicWindow } from "@/lib/types";

type GeneratePlanInput = {
  userId: string;
  postsPerWeek: number;
  totalWeeks: number;
  channels: SocialChannel[];
  mediaMode: MediaMode;
  countryCode: string;
  topicWindows: TopicWindow[];
  brandContext?: BrandContext;
};

type GeneratePlanOutput = {
  posts: PostDraft[];
};

const bestHoursByCountry: Record<string, number[]> = {
  NO: [8, 11, 18],
  SE: [8, 12, 19],
  DK: [9, 12, 18],
  US: [10, 13, 17],
};

const defaultPostingDayOffsets = [0, 2, 4];

const getTopicForWeek = (week: number, windows: TopicWindow[]): string => {
  const match = windows.find((window) => week >= window.startWeek && week <= window.endWeek);
  return match?.topic ?? "Generell merkevarebygging";
};

const getHour = (countryCode: string, index: number): number => {
  const hours = bestHoursByCountry[countryCode] ?? bestHoursByCountry.NO;
  return hours[index % hours.length];
};

const startOfWeekMonday = (value: Date): Date => {
  const date = new Date(value);
  const day = date.getDay();
  const distanceToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + distanceToMonday);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getPostingDayOffsets = (postsPerWeek: number): number[] => {
  if (postsPerWeek <= defaultPostingDayOffsets.length) {
    return defaultPostingDayOffsets.slice(0, postsPerWeek);
  }

  return Array.from({ length: postsPerWeek }, (_, index) => Math.min(index, 6));
};

const scheduleDate = (weekStart: Date, dayOffset: number, hour: number): string => {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

export const generatePlan = async (input: GeneratePlanInput): Promise<GeneratePlanOutput> => {
  const posts: PostDraft[] = [];
  const currentWeekMonday = startOfWeekMonday(new Date());
  const postingDayOffsets = getPostingDayOffsets(input.postsPerWeek);

  for (let week = 0; week < input.totalWeeks; week += 1) {
    const weekTopic = getTopicForWeek(week + 1, input.topicWindows);
    const weekStart = new Date(currentWeekMonday);
    weekStart.setDate(currentWeekMonday.getDate() + week * 7);

    for (let dayIndex = 0; dayIndex < postingDayOffsets.length; dayIndex += 1) {
      const dayOffset = postingDayOffsets[dayIndex];
      const scheduledAt = scheduleDate(weekStart, dayOffset, getHour(input.countryCode, dayIndex));

      const generatedForDay = await Promise.all(
        input.channels.map((channel) => {
          const strategy = assignPostStrategy({
            weekIndex: week,
            dayIndex,
            channel,
          });

          return generatePost({
            userId: input.userId,
            topic: weekTopic,
            channel,
            scheduledAt,
            mediaMode: input.mediaMode,
            brandContext: input.brandContext,
            intent: strategy.intent,
            format: strategy.format,
            ctaType: strategy.ctaType,
            imageDirection: strategy.imageDirection,
          });
        }),
      );
      posts.push(...generatedForDay);
    }
  }

  return {
    posts: posts.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
  };
};

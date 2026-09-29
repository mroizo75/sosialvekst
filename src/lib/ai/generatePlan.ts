import { generatePost } from "@/lib/ai/generatePost";
import { assignPostStrategy } from "@/lib/ai/postStrategy";
import {
  addCalendarDays,
  audienceHoursForCountry,
  minuteForChannel,
  mondayOf,
  scheduleInTimeZone,
  timeZoneForCountry,
} from "@/lib/schedule/audienceTime";
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

const defaultPostingDayOffsets = [0, 2, 4];

const getTopicForWeek = (week: number, windows: TopicWindow[]): string => {
  const match = windows.find((window) => week >= window.startWeek && week <= window.endWeek);
  return match?.topic ?? "Generell merkevarebygging";
};

const getHour = (countryCode: string, index: number): number => {
  const hours = audienceHoursForCountry(countryCode);
  return hours[index % hours.length];
};

const getPostingDayOffsets = (postsPerWeek: number): number[] => {
  if (postsPerWeek <= defaultPostingDayOffsets.length) {
    return defaultPostingDayOffsets.slice(0, postsPerWeek);
  }

  return Array.from({ length: postsPerWeek }, (_, index) => Math.min(index, 6));
};

export const generatePlan = async (input: GeneratePlanInput): Promise<GeneratePlanOutput> => {
  const posts: PostDraft[] = [];
  const timeZone = timeZoneForCountry(input.countryCode);
  let weekMonday = mondayOf(new Date(), timeZone);
  const postingDayOffsets = getPostingDayOffsets(input.postsPerWeek);

  for (let week = 0; week < input.totalWeeks; week += 1) {
    const weekTopic = getTopicForWeek(week + 1, input.topicWindows);
    const weekAnchor = new Date(Date.UTC(weekMonday.year, weekMonday.month - 1, weekMonday.day, 12));

    for (let dayIndex = 0; dayIndex < postingDayOffsets.length; dayIndex += 1) {
      const dayOffset = postingDayOffsets[dayIndex];
      const hour = getHour(input.countryCode, dayIndex);

      const generatedForDay = await Promise.all(
        input.channels.map((channel) => {
          const scheduledAt = scheduleInTimeZone({
            timeZone,
            anchor: weekAnchor,
            dayOffset,
            hour,
            minute: minuteForChannel(channel),
          });

          const strategy = assignPostStrategy({
            weekIndex: week,
            dayIndex,
            channel,
            postsPerWeek: postingDayOffsets.length,
            hasCustomerStories: (input.brandContext?.customerSuccessStories?.length ?? 0) > 0,
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
            contentPillar: strategy.contentPillar,
            visualMotif: strategy.visualMotif,
            reelScript: strategy.reelScript,
            includeWebsiteLink: strategy.includeWebsiteLink,
            feedIndex: strategy.feedIndex,
          });
        }),
      );
      posts.push(...generatedForDay);
    }

    weekMonday = addCalendarDays(weekMonday, 7);
  }

  return {
    posts: posts.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
  };
};

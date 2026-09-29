import { generatePost } from "@/lib/ai/generatePost";
import { assignPostStrategy } from "@/lib/ai/postStrategy";
import { extractDestination } from "@/lib/ai/visualDirection";
import { logger } from "@/lib/logger";
import { getOpenAiClient } from "@/lib/openai";
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

const ANGLE_FRAMES = [
  (seed: string) => `Slik ser ${seed} ut i praksis`,
  (seed: string) => `Det du bør sjekke før du velger ${seed}`,
  (seed: string) => `Et konkret valg rundt ${seed}`,
  (seed: string) => `Hva som skjer når du bruker ${seed}`,
];

export type PostAngle = {
  angle: string;
  place?: string;
};

const profileSeeds = (brandContext?: BrandContext): string[] =>
  [
    ...(brandContext?.products ?? []),
    ...(brandContext?.services ?? []),
    brandContext?.seasonalFocus ?? "",
  ]
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 0);

export const fallbackAngle = (brandContext?: BrandContext): string => {
  const seed = profileSeeds(brandContext)[0];
  return seed ? `Slik ser ${seed} ut i praksis` : "Et konkret valg kunden står i nå";
};

const getTopicForWeek = (week: number, windows: TopicWindow[], brandContext?: BrandContext): string => {
  const match = windows.find((window) => week >= window.startWeek && week <= window.endWeek);
  return match?.topic ?? fallbackAngle(brandContext);
};

const placeFromText = (text: string): string | undefined =>
  extractDestination(undefined, text) ?? undefined;

export const anglesFromProfile = (
  topic: string,
  brandContext: BrandContext | undefined,
  count: number,
  used: string[] = [],
): PostAngle[] => {
  const seeds = [...profileSeeds(brandContext)];
  const cleanTopic = topic.trim();
  if (cleanTopic && cleanTopic !== fallbackAngle(brandContext)) seeds.unshift(cleanTopic);
  if (seeds.length === 0) seeds.push("det kunden faktisk velger");

  const usedSet = new Set(used.map((item) => item.toLowerCase()));
  const angles: PostAngle[] = [];
  let cursor = 0;
  const limit = count * ANGLE_FRAMES.length * seeds.length + 4;
  while (angles.length < count && cursor < limit) {
    const seed = seeds[cursor % seeds.length] ?? seeds[0];
    const frame = ANGLE_FRAMES[Math.floor(cursor / seeds.length) % ANGLE_FRAMES.length];
    cursor += 1;
    const angle = frame(seed);
    if (usedSet.has(angle.toLowerCase())) continue;
    usedSet.add(angle.toLowerCase());
    angles.push({ angle, place: placeFromText(seed) });
  }
  while (angles.length < count) {
    const angle = `${fallbackAngle(brandContext)} (${angles.length + 1})`;
    angles.push({ angle });
  }
  return angles;
};

const parseAngles = (raw: string, count: number, corpus: string): PostAngle[] => {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { angles?: { angle?: string; place?: string | null }[] };
    const angles: PostAngle[] = [];
    for (const item of parsed.angles ?? []) {
      const angle = item.angle?.replace(/\s+/g, " ").trim() ?? "";
      if (!angle) continue;
      const place = item.place?.trim();
      const knownPlace = place && corpus.toLowerCase().includes(place.toLowerCase()) ? place : undefined;
      const built: PostAngle = knownPlace ? { angle, place: knownPlace } : { angle };
      angles.push(built);
      if (angles.length >= count) break;
    }
    return angles;
  } catch {
    return [];
  }
};

export const planAngles = async (
  topicWindows: TopicWindow[],
  brandContext: BrandContext | undefined,
  postCount: number,
  week: number,
  used: string[] = [],
): Promise<PostAngle[]> => {
  const topic = getTopicForWeek(week, topicWindows, brandContext);
  const fallback = anglesFromProfile(topic, brandContext, postCount, used);
  const client = getOpenAiClient();
  if (!client || postCount <= 0) return fallback;

  const corpus = `${topic} ${profileSeeds(brandContext).join(" ")}`;
  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      max_output_tokens: 700,
      input: [
        {
          role: "user",
          content: [
            "Lag én unik vinkel per innlegg. Svar kun med JSON.",
            '{"angles":[{"angle":"kort setning","place":null}]}',
            `Antall: ${postCount}.`,
            `Uketema: ${topic}.`,
            `Produkter og tjenester: ${profileSeeds(brandContext).join(", ") || "ingen oppgitt"}.`,
            "place skal være null med mindre stedet står i uketemaet eller i produktene.",
            used.length > 0 ? `Ikke gjenta disse: ${used.slice(-5).join(" | ")}` : "",
          ].filter(Boolean).join("\n"),
        },
      ],
    });
    const parsed = parseAngles(response.output_text || "", postCount, corpus);
    if (parsed.length >= postCount) return parsed;
  } catch (error) {
    logger.warn("Kunne ikke planlegge vinkler", {
      week,
      error: error instanceof Error ? error.message : "ukjent",
    });
  }
  return fallback;
};

const openingSentence = (text: string): string =>
  text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0]?.trim() ?? "";

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

  const used: string[] = [];

  for (let week = 0; week < input.totalWeeks; week += 1) {
    const weekTopic = getTopicForWeek(week + 1, input.topicWindows, input.brandContext);
    const weekAnchor = new Date(Date.UTC(weekMonday.year, weekMonday.month - 1, weekMonday.day, 12));
    const postsThisWeek = postingDayOffsets.length * input.channels.length;
    const weekAngles = await planAngles(input.topicWindows, input.brandContext, postsThisWeek, week + 1, used);
    let angleIndex = 0;

    for (let dayIndex = 0; dayIndex < postingDayOffsets.length; dayIndex += 1) {
      const dayOffset = postingDayOffsets[dayIndex];
      const hour = getHour(input.countryCode, dayIndex);
      const dayAngles: string[] = [];

      for (const channel of input.channels) {
        const scheduledAt = scheduleInTimeZone({
          timeZone,
          anchor: weekAnchor,
          dayOffset,
          hour,
          minute: minuteForChannel(channel),
        });
        const angle = weekAngles[angleIndex] ?? { angle: weekTopic };
        angleIndex += 1;
        dayAngles.push(angle.angle);

        const strategy = assignPostStrategy({
          weekIndex: week,
          dayIndex,
          channel,
          postsPerWeek: postingDayOffsets.length,
          hasCustomerStories: (input.brandContext?.customerSuccessStories?.length ?? 0) > 0,
        });

        const post = await generatePost({
          userId: input.userId,
          topic: angle.place ? `${angle.angle} Sted: ${angle.place}.` : angle.angle,
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
          avoidRepeating: used.slice(-5),
        });
        posts.push(post);
        used.push(angle.angle);
        if (angle.place) used.push(angle.place);
        const opening = openingSentence(post.text);
        if (opening) used.push(opening);
      }

      const uniqueDayAngles = new Set(dayAngles.map((angle) => angle.toLowerCase()));
      if (input.channels.length > 1 && uniqueDayAngles.size < dayAngles.length) {
        logger.warn("Samme dags vinkler kolliderte", { week, dayIndex });
      }
    }

    weekMonday = addCalendarDays(weekMonday, 7);
  }

  return {
    posts: posts.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
  };
};

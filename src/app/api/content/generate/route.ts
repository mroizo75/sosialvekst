import { NextResponse } from "next/server";
import { z } from "zod";

import { generatePost } from "@/lib/ai/generatePost";
import { assignPostStrategy } from "@/lib/ai/postStrategy";
import { requireUserId } from "@/lib/auth";
import { getBrandContext } from "@/lib/branding/context";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { createContentPlan } from "@/lib/posts/repository";
import { getPostsPerWeekAllowance, requireActiveSubscription } from "@/lib/subscription";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BrandContext, SocialChannel, TopicWindow } from "@/lib/types";

const generateSchema = z.object({
  postsPerWeek: z.number().int().min(1).max(7).default(3),
  totalWeeks: z.number().int().min(1).max(12).default(4),
  channels: z.array(z.enum(["facebook", "instagram", "linkedin"])).min(1),
  mediaMode: z.enum(["ai_only", "hybrid", "owned_only"]).default("hybrid"),
  countryCode: z.string().length(2).default("NO"),
  startDate: z.string().datetime().optional(),
  topicWindows: z
    .array(
      z.object({
        topic: z.string().min(1),
        startWeek: z.number().int().min(1),
        endWeek: z.number().int().min(1),
      }),
    )
    .default([]),
});

const bestHoursByCountry: Record<string, number[]> = {
  NO: [8, 11, 18],
  SE: [8, 12, 19],
  DK: [9, 12, 18],
  US: [10, 13, 17],
};

const defaultPostingDayOffsets = [0, 2, 4];

const getTopicForWeek = (week: number, windows: TopicWindow[]): string => {
  const match = windows.find((w) => week >= w.startWeek && week <= w.endWeek);
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

type PlaceholderSlot = {
  id: string;
  channel: SocialChannel;
  scheduledAt: string;
  weekIndex: number;
  dayIndex: number;
  topic: string;
};

const buildSlots = (
  postsPerWeek: number,
  totalWeeks: number,
  channels: SocialChannel[],
  countryCode: string,
  topicWindows: TopicWindow[],
  startDate?: string,
): PlaceholderSlot[] => {
  const slots: PlaceholderSlot[] = [];
  const now = new Date();
  const dayOffsets = getPostingDayOffsets(postsPerWeek);
  const targetTotal = postsPerWeek * totalWeeks * channels.length;

  const baseDate = startDate ? new Date(startDate) : now;
  const thisMonday = startOfWeekMonday(baseDate);

  const weekCursor = new Date(thisMonday);
  let logicalWeek = 0;

  while (slots.length < targetTotal) {
    const weekTopic = getTopicForWeek(logicalWeek + 1, topicWindows);

    for (let dayIndex = 0; dayIndex < dayOffsets.length; dayIndex += 1) {
      if (slots.length >= targetTotal) break;

      const dayOffset = dayOffsets[dayIndex];
      const hour = getHour(countryCode, dayIndex);
      const scheduled = scheduleDate(weekCursor, dayOffset, hour);

      if (new Date(scheduled).getTime() <= now.getTime()) {
        continue;
      }

      for (const channel of channels) {
        slots.push({
          id: crypto.randomUUID(),
          channel,
          scheduledAt: scheduled,
          weekIndex: logicalWeek,
          dayIndex,
          topic: weekTopic,
        });
      }
    }

    weekCursor.setDate(weekCursor.getDate() + 7);
    logicalWeek += 1;
  }

  return slots;
};

const placeholderQuality = {
  languageQuality: 0,
  brandMatch: 0,
  factualClarity: 0,
  engagementPotential: 0,
  visualQuality: 0,
  ctaPresent: false,
  companyMentioned: false,
  total: 0,
};

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const subscription = await requireActiveSubscription(userId);
    const brandContext = await getBrandContext(userId);
    const json = await request.json();
    const payload = generateSchema.parse(json);
    const allowance = getPostsPerWeekAllowance(subscription);

    if (payload.postsPerWeek > allowance) {
      return NextResponse.json(
        toAppError(
          "PLAN_LIMIT_EXCEEDED",
          `Abonnementet ditt tillater maks ${allowance} poster per uke.`,
        ),
        { status: 403 },
      );
    }

    const planId = await createContentPlan({
      userId,
      postsPerWeek: payload.postsPerWeek,
      totalWeeks: payload.totalWeeks,
      countryCode: payload.countryCode,
      mediaMode: payload.mediaMode,
      topicWindows: payload.topicWindows,
    });

    const slots = buildSlots(
      payload.postsPerWeek,
      payload.totalWeeks,
      payload.channels,
      payload.countryCode,
      payload.topicWindows,
      payload.startDate,
    );

    const supabase = await createSupabaseServerClient();
    const placeholderRows = slots.map((slot) => ({
      id: slot.id,
      user_id: userId,
      plan_id: planId,
      channel: slot.channel,
      status: "generating",
      scheduled_at: slot.scheduledAt,
      text_content: "",
      image_url: null,
      video_url: null,
      quality_score: placeholderQuality,
    }));

    const { error: insertError } = await supabase.from("posts").insert(placeholderRows);
    if (insertError) {
      return NextResponse.json(
        toAppError("PLACEHOLDER_INSERT_FAILED", "Kunne ikke opprette plassholdere", insertError.message),
        { status: 500 },
      );
    }

    const adminClient = createSupabaseAdminClient();
    await adminClient.from("generation_log").insert({
      user_id: userId,
      action: "generate_plan",
      post_count: slots.length,
    });

    void processSlots(userId, slots, payload.mediaMode, brandContext);

    const placeholderPosts = slots.map((s) => ({
      id: s.id,
      channel: s.channel,
      status: "generating" as const,
      scheduledAt: s.scheduledAt,
      text: "",
      quality: placeholderQuality,
    }));

    return NextResponse.json({
      planId,
      totalPosts: slots.length,
      status: "generating",
      posts: placeholderPosts,
    });
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("CONTENT_GENERATION_FAILED", "Kunne ikke starte generering", appError),
      { status: 400 },
    );
  }
}

async function processSlots(
  userId: string,
  slots: PlaceholderSlot[],
  mediaMode: "ai_only" | "hybrid" | "owned_only",
  brandContext?: BrandContext,
) {
  const supabase = createSupabaseAdminClient();
  let completed = 0;

  console.log(`[generate] Starter generering av ${slots.length} poster for bruker ${userId}`);

  for (const slot of slots) {
    try {
      console.log(`[generate] Post ${completed + 1}/${slots.length} (${slot.channel}, ${slot.id.slice(0, 8)})`);

      const strategy = assignPostStrategy({
        weekIndex: slot.weekIndex,
        dayIndex: slot.dayIndex,
        channel: slot.channel,
      });

      const post = await generatePost({
        userId,
        topic: slot.topic,
        channel: slot.channel,
        scheduledAt: slot.scheduledAt,
        mediaMode,
        imageProfile: "preview",
        brandContext,
        intent: strategy.intent,
        format: strategy.format,
        ctaType: strategy.ctaType,
        imageDirection: strategy.imageDirection,
      });

      const { error } = await supabase
        .from("posts")
        .update({
          text_content: post.text,
          image_url: post.imageUrl ?? null,
          status: post.status,
          quality_score: post.quality,
          updated_at: new Date().toISOString(),
        })
        .eq("id", slot.id)
        .eq("user_id", userId);

      if (error) {
        console.error(`[generate] DB-oppdatering feilet for ${slot.id}:`, error.message);
      }

      completed += 1;
      console.log(`[generate] Post ${completed}/${slots.length} ferdig`);
    } catch (err) {
      completed += 1;
      console.error(`[generate] Post ${completed}/${slots.length} feilet:`, err);

      await supabase
        .from("posts")
        .update({
          text_content: "Generering feilet. Klikk «Generer på nytt» for å prøve igjen.",
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", slot.id)
        .eq("user_id", userId);
    }
  }

  console.log(`[generate] Ferdig — ${completed}/${slots.length} poster generert`);
}

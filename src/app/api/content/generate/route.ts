import { NextResponse } from "next/server";
import { z } from "zod";

import { generatePost } from "@/lib/ai/generatePost";
import { assignPostStrategy } from "@/lib/ai/postStrategy";
import { requireUserId } from "@/lib/auth";
import { getBrandContext } from "@/lib/branding/context";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { createContentPlan } from "@/lib/posts/repository";
import { requireWorkspaceId } from "@/lib/workspace";
import { getPostsPerWeekAllowance, requireActiveSubscription } from "@/lib/subscription";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BrandContext, SocialChannel, TopicWindow } from "@/lib/types";

const generateSchema = z.object({
  postsPerWeek: z.number().int().min(1).max(7).default(3),
  totalWeeks: z.number().int().min(1).max(12).default(4),
  channels: z.array(z.enum(["facebook", "instagram", "linkedin", "tiktok"])).min(1),
  mediaMode: z.enum(["ai_only", "hybrid", "owned_only"]).default("hybrid"),
  countryCode: z.string().length(2).default("NO"),
  startDate: z.string().datetime().optional(),
  postingDays: z.array(z.number().int().min(0).max(6)).optional(),
  postingHours: z.array(z.number().int().min(0).max(23)).optional(),
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

const getPostingDayOffsets = (postsPerWeek: number, customDays?: number[]): number[] => {
  if (customDays && customDays.length > 0) {
    return [...customDays].sort((a, b) => a - b).slice(0, postsPerWeek);
  }
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
  customDays?: number[],
  customHours?: number[],
): PlaceholderSlot[] => {
  const slots: PlaceholderSlot[] = [];
  const now = new Date();
  const dayOffsets = getPostingDayOffsets(postsPerWeek, customDays);
  const targetTotal = postsPerWeek * totalWeeks * channels.length;

  const baseDate = startDate ? new Date(startDate) : now;
  const earliestAllowed = new Date(Math.max(baseDate.getTime(), now.getTime()));
  const thisMonday = startOfWeekMonday(baseDate);

  const weekCursor = new Date(thisMonday);
  let logicalWeek = 0;

  while (slots.length < targetTotal) {
    const weekTopic = getTopicForWeek(logicalWeek + 1, topicWindows);

    for (let dayIndex = 0; dayIndex < dayOffsets.length; dayIndex += 1) {
      if (slots.length >= targetTotal) break;

      const dayOffset = dayOffsets[dayIndex];
      const hour = customHours && customHours[dayIndex] !== undefined
        ? customHours[dayIndex]
        : getHour(countryCode, dayIndex);
      const scheduled = scheduleDate(weekCursor, dayOffset, hour);

      if (new Date(scheduled).getTime() < earliestAllowed.getTime()) {
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
    const workspaceId = await requireWorkspaceId(userId);
    const subscription = await requireActiveSubscription(userId);
    const brandContext = await getBrandContext(userId, workspaceId);
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
      workspaceId,
      postsPerWeek: payload.postsPerWeek,
      totalWeeks: payload.totalWeeks,
      countryCode: payload.countryCode,
      mediaMode: payload.mediaMode,
      topicWindows: payload.topicWindows,
      channels: payload.channels,
    });

    const slots = buildSlots(
      payload.postsPerWeek,
      payload.totalWeeks,
      payload.channels,
      payload.countryCode,
      payload.topicWindows,
      payload.startDate,
      payload.postingDays,
      payload.postingHours,
    );

    const supabase = await createSupabaseServerClient();
    const placeholderRows = slots.map((slot) => ({
      id: slot.id,
      user_id: userId,
      workspace_id: workspaceId,
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
      workspace_id: workspaceId,
      action: "generate_plan",
      post_count: slots.length,
    });

    void processSlots(userId, workspaceId, slots, payload.mediaMode, brandContext);

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
    if (appError.code === "SUBSCRIPTION_REQUIRED") {
      return NextResponse.json(appError, { status: 403 });
    }
    return NextResponse.json(
      toAppError("CONTENT_GENERATION_FAILED", "Kunne ikke starte generering", appError),
      { status: 400 },
    );
  }
}

const DB_RETRY_ATTEMPTS = 3;
const DB_RETRY_DELAY_MS = 800;
const POST_GENERATION_TIMEOUT_MS = 90_000;
const TIKTOK_GENERATION_TIMEOUT_MS = 240_000;
const CONCURRENCY = 3;

async function updatePostWithRetry(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  postId: string,
  userId: string,
  workspaceId: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  for (let attempt = 1; attempt <= DB_RETRY_ATTEMPTS; attempt += 1) {
    const { error } = await supabase
      .from("posts")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", postId)
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId);

    if (!error) return true;

    console.error(`[generate] DB forsøk ${attempt}/${DB_RETRY_ATTEMPTS} feilet for ${postId}:`, error.message);

    if (attempt < DB_RETRY_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, DB_RETRY_DELAY_MS * attempt));
    }
  }
  return false;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout etter ${ms / 1000}s: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function generateSingleSlot(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  workspaceId: string,
  slot: PlaceholderSlot,
  mediaMode: "ai_only" | "hybrid" | "owned_only",
  brandContext: BrandContext | undefined,
): Promise<boolean> {
  try {
    const strategy = assignPostStrategy({
      weekIndex: slot.weekIndex,
      dayIndex: slot.dayIndex,
      channel: slot.channel,
    });

    const timeoutMs = slot.channel === "tiktok"
      ? TIKTOK_GENERATION_TIMEOUT_MS
      : POST_GENERATION_TIMEOUT_MS;

    const post = await withTimeout(
      generatePost({
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
      }),
      timeoutMs,
      `${slot.channel}/${slot.id.slice(0, 8)}`,
    );

    return await updatePostWithRetry(supabase, slot.id, userId, workspaceId, {
      text_content: post.text,
      image_url: post.imageUrl ?? null,
      video_url: post.videoUrl ?? null,
      status: post.status,
      quality_score: post.quality,
    });
  } catch (err) {
    console.error(`[generate] Post ${slot.id.slice(0, 8)} feilet:`, err instanceof Error ? err.message : err);

    await updatePostWithRetry(supabase, slot.id, userId, workspaceId, {
      text_content: "Generering feilet. Klikk «Generer på nytt» for å prøve igjen.",
      status: "failed",
    });
    return false;
  }
}

async function processSlots(
  userId: string,
  workspaceId: string,
  slots: PlaceholderSlot[],
  mediaMode: "ai_only" | "hybrid" | "owned_only",
  brandContext?: BrandContext,
) {
  const supabase = createSupabaseAdminClient();
  let succeeded = 0;
  let completed = 0;

  console.log(`[generate] Starter generering av ${slots.length} poster (${CONCURRENCY} parallelt) for bruker ${userId}`);

  for (let i = 0; i < slots.length; i += CONCURRENCY) {
    const batch = slots.slice(i, i + CONCURRENCY);
    const batchLabel = `${i + 1}–${Math.min(i + CONCURRENCY, slots.length)}/${slots.length}`;
    console.log(`[generate] Batch ${batchLabel} (${batch.map((s) => s.channel).join(", ")})`);

    const results = await Promise.allSettled(
      batch.map((slot) => generateSingleSlot(supabase, userId, workspaceId, slot, mediaMode, brandContext)),
    );

    for (const result of results) {
      completed += 1;
      if (result.status === "fulfilled" && result.value) {
        succeeded += 1;
      }
    }

    console.log(`[generate] Batch ferdig — ${succeeded}/${completed} OK så langt`);
  }

  console.log(`[generate] Ferdig — ${succeeded}/${slots.length} poster generert OK, ${completed - succeeded} feilet`);
}

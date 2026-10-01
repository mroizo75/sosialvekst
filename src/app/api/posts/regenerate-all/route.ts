import { NextResponse } from "next/server";

import { fallbackAngle } from "@/lib/ai/generatePlan";
import { generatePost } from "@/lib/ai/generatePost";
import { assignPostStrategy } from "@/lib/ai/postStrategy";
import { requireUserId } from "@/lib/auth";
import { getBrandContext } from "@/lib/branding/context";
import { deleteFilesByUrls } from "@/lib/cloudflare/r2";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { replacePostMedia, updatePostRow } from "@/lib/posts/repository";
import { requireActiveSubscription } from "@/lib/subscription";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";
import {
  addCalendarDays,
  audienceHoursForCountry,
  minuteForChannel,
  mondayOf,
  scheduleInTimeZone,
  timeZoneForCountry,
} from "@/lib/schedule/audienceTime";
import type { BrandContext, SocialChannel, TopicWindow } from "@/lib/types";
import { getReelBudget, reelColumns, reelsAllowedFor, reserveReel, startReelRender } from "@/lib/video/renderReel";

const DEFAULT_POSTS_PER_WEEK = 3;
const DEFAULT_TOTAL_WEEKS = 4;
const DEFAULT_CHANNELS: SocialChannel[] = ["facebook", "instagram", "linkedin"];

const normalizePositiveInt = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return fallback;
};

const normalizeChannels = (value: unknown): SocialChannel[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const valid = value
    .filter((item): item is string => typeof item === "string")
    .filter((item): item is SocialChannel => item === "facebook" || item === "instagram" || item === "linkedin" || item === "tiktok");
  return [...new Set(valid)];
};

export async function POST() {
  try {
    const userId = await requireUserId();
    const workspaceId = await requireWorkspaceId(userId);
    await requireActiveSubscription(userId);
    const brandContext = await getBrandContext(userId, workspaceId);
    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdminClient();

    const { data: oldPosts, error: fetchError } = await supabase
      .from("posts")
      .select("id, channel, scheduled_at, image_url, plan_id")
      .eq("user_id", userId)
      .order("scheduled_at", { ascending: true });

    if (fetchError) {
      return NextResponse.json(
        toAppError("POSTS_FETCH_FAILED", "Kunne ikke hente eksisterende poster.", fetchError.message),
        { status: 400 },
      );
    }

    const oldImageUrls = (oldPosts ?? [])
      .map((p) => p.image_url as string | null)
      .filter((url): url is string => Boolean(url));

    const channelsFromPosts = [...new Set((oldPosts ?? []).map((p) => p.channel as SocialChannel))];
    let channelsFromPlan: SocialChannel[] = [];
    let postsPerWeek = DEFAULT_POSTS_PER_WEEK;
    let totalWeeks = DEFAULT_TOTAL_WEEKS;
    let mediaMode: "ai_only" | "hybrid" | "owned_only" = "ai_only";

    let planId = ((oldPosts ?? []).find((p) => p.plan_id)?.plan_id as string) ?? null;
    if (!planId) {
      const { data: existingPlan } = await admin
        .from("content_plans")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingPlan) {
        planId = existingPlan.id as string;
        postsPerWeek = normalizePositiveInt(existingPlan.posts_per_week, DEFAULT_POSTS_PER_WEEK);
        totalWeeks = normalizePositiveInt(existingPlan.total_weeks, DEFAULT_TOTAL_WEEKS);
        mediaMode = String(existingPlan.media_mode ?? "ai_only") as "ai_only" | "hybrid" | "owned_only";
        channelsFromPlan = normalizeChannels((existingPlan as { channels?: unknown }).channels);
      } else {
        let newPlan: { id: string } | null = null;
        let planError: { message?: string } | null = null;
        const withChannels = await admin
          .from("content_plans")
          .insert({
            user_id: userId,
            posts_per_week: postsPerWeek,
            total_weeks: totalWeeks,
            country_code: "NO",
            media_mode: "ai_only",
            channels: DEFAULT_CHANNELS,
          })
          .select("id")
          .single();
        newPlan = withChannels.data as { id: string } | null;
        planError = withChannels.error as { message?: string } | null;

        if (planError?.message?.toLowerCase().includes("channels")) {
          const withoutChannels = await admin
            .from("content_plans")
            .insert({
              user_id: userId,
              posts_per_week: postsPerWeek,
              total_weeks: totalWeeks,
              country_code: "NO",
              media_mode: "ai_only",
            })
            .select("id")
            .single();
          newPlan = withoutChannels.data as { id: string } | null;
          planError = withoutChannels.error as { message?: string } | null;
        }

        if (planError || !newPlan) {
          return NextResponse.json(
            toAppError("PLAN_FAILED", "Kunne ikke opprette innholdsplan."),
            { status: 500 },
          );
        }
        planId = newPlan.id as string;
      }
    } else {
      const { data: selectedPlan } = await admin
        .from("content_plans")
        .select("*")
        .eq("id", planId)
        .eq("user_id", userId)
        .maybeSingle();

      postsPerWeek = normalizePositiveInt(selectedPlan?.posts_per_week, DEFAULT_POSTS_PER_WEEK);
      totalWeeks = normalizePositiveInt(selectedPlan?.total_weeks, DEFAULT_TOTAL_WEEKS);
      mediaMode = String(selectedPlan?.media_mode ?? "ai_only") as "ai_only" | "hybrid" | "owned_only";
      channelsFromPlan = normalizeChannels((selectedPlan as { channels?: unknown } | null)?.channels);
    }

    const { data: planData } = await admin
      .from("content_plans")
      .select("topic_windows, country_code")
      .eq("id", planId)
      .eq("user_id", userId)
      .maybeSingle();

    const topicWindows = Array.isArray(planData?.topic_windows)
      ? (planData.topic_windows as TopicWindow[])
      : [];

    const channelSet = channelsFromPlan.length > 0
      ? channelsFromPlan
      : channelsFromPosts.length > 0
        ? channelsFromPosts
        : DEFAULT_CHANNELS;

    const { error: deleteError } = await admin
      .from("posts")
      .delete()
      .eq("user_id", userId);

    if (deleteError) {
      console.error("[regenerate-all] Sletting feilet:", deleteError.message);
      return NextResponse.json(
        toAppError("DELETE_FAILED", "Kunne ikke slette gamle poster.", deleteError.message),
        { status: 500 },
      );
    }

    const now = new Date();
    const dayOffsets = [0, 2, 4];
    const countryCode = String((planData as { country_code?: string } | null)?.country_code ?? "NO");
    const timeZone = timeZoneForCountry(countryCode);
    const bestHours = audienceHoursForCountry(countryCode);

    const newSlots: Slot[] = [];
    const targetTotal = postsPerWeek * totalWeeks * channelSet.length;
    let weekMonday = mondayOf(now, timeZone);
    let logicalWeek = 0;

    while (newSlots.length < targetTotal) {
      const weekAnchor = new Date(Date.UTC(weekMonday.year, weekMonday.month - 1, weekMonday.day, 12));
      for (let dayIndex = 0; dayIndex < dayOffsets.length; dayIndex += 1) {
        if (newSlots.length >= targetTotal) break;

        for (const channel of channelSet) {
          if (newSlots.length >= targetTotal) break;
          const scheduledAt = scheduleInTimeZone({
            timeZone,
            anchor: weekAnchor,
            dayOffset: dayOffsets[dayIndex],
            hour: bestHours[dayIndex] ?? bestHours[0],
            minute: minuteForChannel(channel),
          });
          if (new Date(scheduledAt).getTime() <= now.getTime()) continue;

          newSlots.push({
            id: crypto.randomUUID(),
            channel,
            scheduledAt,
            weekIndex: logicalWeek,
            dayIndex,
            topic: getTopicForWeek(logicalWeek + 1, topicWindows, brandContext),
          });
        }
      }
      weekMonday = addCalendarDays(weekMonday, 7);
      logicalWeek += 1;
    }

    const placeholderQuality = {
      languageQuality: 0, brandMatch: 0, factualClarity: 0,
      engagementPotential: 0, visualQuality: 0,
      ctaPresent: false, companyMentioned: false, total: 0,
    };

    const inserts = newSlots.map((s) => ({
      id: s.id,
      user_id: userId,
      plan_id: planId,
      channel: s.channel,
      status: "generating",
      scheduled_at: s.scheduledAt,
      text_content: "",
      image_url: null,
      quality_score: placeholderQuality,
    }));

    const { error: insertError } = await admin.from("posts").insert(inserts);

    if (insertError) {
      console.error("[regenerate-all] Insert feilet:", insertError.message);
      return NextResponse.json(
        toAppError("INSERT_FAILED", "Kunne ikke opprette nye poster.", insertError.message),
        { status: 500 },
      );
    }

    await admin.from("generation_log").insert({
      user_id: userId,
      workspace_id: workspaceId,
      action: "regenerate_all",
      post_count: newSlots.length,
    });

    console.log(`[regenerate-all] Starter generering av ${newSlots.length} poster for bruker ${userId}`);

    void (async () => {
      try {
        await deleteFilesByUrls(oldImageUrls);
      } catch (err) {
        console.error("[regenerate-all] R2-sletting feilet:", err);
      }
      await regenerateSlots(userId, newSlots, mediaMode, brandContext);
      console.log(`[regenerate-all] Ferdig — ${newSlots.length} poster generert`);
    })().catch((err) => {
      console.error("[regenerate-all] Bakgrunnsjobb krasjet:", err);
    });

    const placeholderPosts = newSlots.map((s) => ({
      id: s.id,
      channel: s.channel,
      status: "generating" as const,
      scheduledAt: s.scheduledAt,
      text: "",
      quality: placeholderQuality,
    }));

    return NextResponse.json({
      total: newSlots.length,
      status: "generating",
      posts: placeholderPosts,
    });
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("REGENERATE_ALL_FAILED", "Kunne ikke starte regenerering", appError),
      { status: 400 },
    );
  }
}

type Slot = {
  id: string;
  channel: SocialChannel;
  scheduledAt: string;
  weekIndex: number;
  dayIndex: number;
  topic: string;
};

const getTopicForWeek = (week: number, windows: TopicWindow[], brandContext?: BrandContext): string => {
  const match = windows.find((w) => week >= w.startWeek && week <= w.endWeek);
  return match?.topic ?? fallbackAngle(brandContext);
};

async function regenerateSlots(
  userId: string,
  slots: Slot[],
  mediaMode: "ai_only" | "hybrid" | "owned_only",
  brandContext?: BrandContext,
) {
  const admin = createSupabaseAdminClient();
  const reelBudget = await getReelBudget(userId, admin);
  let completed = 0;

  for (const slot of slots) {
    try {
      console.log(`[regenerate-all] Genererer post ${completed + 1}/${slots.length} (${slot.channel}, ${slot.id.slice(0, 8)})`);

      const strategy = assignPostStrategy({
        weekIndex: slot.weekIndex,
        dayIndex: slot.dayIndex,
        channel: slot.channel,
        hasCustomerStories: (brandContext?.customerSuccessStories?.length ?? 0) > 0,
        reelsAllowed: reelsAllowedFor(mediaMode, reelBudget),
      });
      reserveReel(reelBudget, strategy.mediaFormat);

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
        contentPillar: strategy.contentPillar,
        visualMotif: strategy.visualMotif,
        reelScript: strategy.reelScript,
        mediaFormat: strategy.mediaFormat,
        includeWebsiteLink: strategy.includeWebsiteLink,
        feedIndex: strategy.feedIndex,
      });

      const error = await updatePostRow(admin, { id: slot.id, userId }, {
        text_content: post.text,
        image_url: post.imageUrl ?? null,
        video_url: null,
        ...reelColumns(post),
        image_credit: post.imageCredit ?? null,
        generation_meta: post.generationMeta ?? null,
        status: post.status,
        quality_score: post.quality,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.error(`[regenerate-all] DB-oppdatering feilet for ${slot.id}:`, error);
      } else {
        const mediaErr = await replacePostMedia(admin, slot.id, post.additionalImageUrls ?? [], post.additionalImageCredits);
        if (mediaErr) {
          console.error(`[regenerate-all] Karusell-lagring feilet for ${slot.id}:`, mediaErr);
        }
        if (post.reelSourceUrl) startReelRender(slot.id);
      }

      completed += 1;
      console.log(`[regenerate-all] Post ${completed}/${slots.length} ferdig`);
    } catch (err) {
      completed += 1;
      console.error(`[regenerate-all] Post ${completed}/${slots.length} feilet:`, err);

      await admin
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
}

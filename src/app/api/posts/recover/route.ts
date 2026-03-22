import { NextResponse } from "next/server";

import { generatePost } from "@/lib/ai/generatePost";
import { assignPostStrategy } from "@/lib/ai/postStrategy";
import { requireUserId } from "@/lib/auth";
import { getBrandContext } from "@/lib/branding/context";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BrandContext, SocialChannel, TopicWindow } from "@/lib/types";

const STUCK_THRESHOLD_MS = 5 * 60 * 1000;
const MAX_RETRY_ATTEMPTS = 3;

type StuckPost = {
  id: string;
  user_id: string;
  plan_id: string | null;
  channel: SocialChannel;
  status: string;
  scheduled_at: string;
  updated_at: string | null;
  created_at: string;
  retry_count: number;
};

const isStuck = (post: StuckPost): boolean => {
  const reference = post.updated_at ?? post.created_at;
  const age = Date.now() - new Date(reference).getTime();
  return age > STUCK_THRESHOLD_MS;
};

const getTopicFromPlan = async (
  planId: string,
  scheduledAt: string,
  userId: string,
): Promise<string> => {
  const admin = createSupabaseAdminClient();

  const { data: planData } = await admin
    .from("content_plans")
    .select("topic_windows")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();

  const topicWindows = Array.isArray(planData?.topic_windows)
    ? (planData.topic_windows as TopicWindow[])
    : [];

  if (topicWindows.length === 0) {
    return "Generell merkevarebygging";
  }

  const { data: firstPost } = await admin
    .from("posts")
    .select("scheduled_at")
    .eq("plan_id", planId)
    .eq("user_id", userId)
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstPost?.scheduled_at) {
    return "Generell merkevarebygging";
  }

  const planStart = new Date(firstPost.scheduled_at);
  const postDate = new Date(scheduledAt);
  const daysDiff = Math.max(0, Math.floor((postDate.getTime() - planStart.getTime()) / 86400000));
  const week = Math.floor(daysDiff / 7) + 1;

  const match = topicWindows.find((w) => week >= w.startWeek && week <= w.endWeek);
  return match?.topic ?? "Generell merkevarebygging";
};

const getMediaModeFromPlan = async (
  planId: string,
  userId: string,
): Promise<"ai_only" | "hybrid" | "owned_only"> => {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("content_plans")
    .select("media_mode")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();

  const value = data?.media_mode;
  if (value === "ai_only" || value === "hybrid" || value === "owned_only") {
    return value;
  }
  return "ai_only";
};

const recoverPost = async (
  post: StuckPost,
  brandContext: BrandContext,
): Promise<{ id: string; recovered: boolean; error?: string }> => {
  const admin = createSupabaseAdminClient();

  try {
    const topic = post.plan_id
      ? await getTopicFromPlan(post.plan_id, post.scheduled_at, post.user_id)
      : "Generell merkevarebygging";

    const mediaMode = post.plan_id
      ? await getMediaModeFromPlan(post.plan_id, post.user_id)
      : "ai_only";

    const strategy = assignPostStrategy({
      weekIndex: 0,
      dayIndex: 0,
      channel: post.channel,
    });

    const generated = await generatePost({
      userId: post.user_id,
      topic,
      channel: post.channel,
      scheduledAt: post.scheduled_at,
      mediaMode,
      imageProfile: "preview",
      brandContext,
      intent: strategy.intent,
      format: strategy.format,
      ctaType: strategy.ctaType,
      imageDirection: strategy.imageDirection,
    });

    const { error } = await admin
      .from("posts")
      .update({
        text_content: generated.text,
        image_url: generated.imageUrl ?? null,
        status: generated.status,
        quality_score: generated.quality,
        retry_count: (post.retry_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", post.id)
      .eq("user_id", post.user_id);

    if (error) {
      return { id: post.id, recovered: false, error: error.message };
    }

    return { id: post.id, recovered: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";

    await admin
      .from("posts")
      .update({
        status: "failed",
        text_content: "Generering feilet etter flere forsøk. Prøv «Generer på nytt».",
        retry_count: (post.retry_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", post.id)
      .eq("user_id", post.user_id);

    return { id: post.id, recovered: false, error: message };
  }
};

export async function POST() {
  try {
    const userId = await requireUserId();
    const admin = createSupabaseAdminClient();

    const { data: stuckPosts, error: fetchError } = await admin
      .from("posts")
      .select("id, user_id, plan_id, channel, status, scheduled_at, updated_at, created_at, retry_count")
      .eq("user_id", userId)
      .in("status", ["generating", "failed"])
      .order("scheduled_at", { ascending: true });

    if (fetchError) {
      return NextResponse.json(
        toAppError("RECOVERY_FETCH_FAILED", "Kunne ikke hente poster for recovery."),
        { status: 500 },
      );
    }

    const eligible = (stuckPosts ?? [])
      .filter((p): p is StuckPost => {
        const retryCount = (p as StuckPost).retry_count ?? 0;
        if (retryCount >= MAX_RETRY_ATTEMPTS && p.status === "failed") {
          return false;
        }
        if (p.status === "generating") {
          return isStuck(p as StuckPost);
        }
        return p.status === "failed";
      });

    if (eligible.length === 0) {
      return NextResponse.json({
        recovered: 0,
        failed: 0,
        skipped: (stuckPosts ?? []).length,
        results: [],
      });
    }

    const brandContext = await getBrandContext(userId);

    const results = [];
    for (const post of eligible) {
      const result = await recoverPost(post as StuckPost, brandContext);
      results.push(result);
    }

    const recovered = results.filter((r) => r.recovered).length;
    const failed = results.filter((r) => !r.recovered).length;

    return NextResponse.json({
      recovered,
      failed,
      skipped: (stuckPosts ?? []).length - eligible.length,
      results,
    });
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("RECOVERY_FAILED", "Recovery feilet.", appError),
      { status: 400 },
    );
  }
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const admin = createSupabaseAdminClient();

    const { data: stuckPosts, error } = await admin
      .from("posts")
      .select("id, status, scheduled_at, updated_at, created_at, retry_count")
      .eq("user_id", userId)
      .in("status", ["generating", "failed"]);

    if (error) {
      return NextResponse.json(
        toAppError("RECOVERY_STATUS_FAILED", "Kunne ikke sjekke status."),
        { status: 500 },
      );
    }

    const posts = stuckPosts ?? [];
    const stuckGenerating = posts.filter(
      (p) => p.status === "generating" && isStuck(p as StuckPost),
    );
    const failedRecoverable = posts.filter(
      (p) => p.status === "failed" && ((p as StuckPost).retry_count ?? 0) < MAX_RETRY_ATTEMPTS,
    );
    const failedPermanent = posts.filter(
      (p) => p.status === "failed" && ((p as StuckPost).retry_count ?? 0) >= MAX_RETRY_ATTEMPTS,
    );
    const activelyGenerating = posts.filter(
      (p) => p.status === "generating" && !isStuck(p as StuckPost),
    );

    return NextResponse.json({
      stuckCount: stuckGenerating.length,
      failedRecoverableCount: failedRecoverable.length,
      failedPermanentCount: failedPermanent.length,
      activelyGeneratingCount: activelyGenerating.length,
      totalProblematic: stuckGenerating.length + failedRecoverable.length,
    });
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("RECOVERY_STATUS_FAILED", "Kunne ikke sjekke status.", appError),
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { getLatestSubscription, getPostsPerWeekAllowance, hasActiveSubscription } from "@/lib/subscription";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";

export async function GET() {
  const userId = await requireUserId();
  const workspaceId = await requireWorkspaceId(userId);
  const supabase = await createSupabaseServerClient();

  const [postsResult, jobsResult, latestPostResult, subscription, planResult] = await Promise.all([
    supabase
      .from("posts")
      .select("status, scheduled_at")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId),
    supabase
      .from("publish_jobs")
      .select("status")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId),
    supabase
      .from("posts")
      .select("scheduled_at")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getLatestSubscription(userId),
    supabase
      .from("content_plans")
      .select("media_mode")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const posts = postsResult.data ?? [];
  const jobs = jobsResult.data ?? [];
  const latestScheduledAt = latestPostResult.data?.scheduled_at ?? null;
  const rawMode = (planResult.data as Record<string, unknown> | null)?.media_mode;
  const mediaMode = typeof rawMode === "string" && ["ai_only", "hybrid", "owned_only"].includes(rawMode)
    ? rawMode
    : "hybrid";

  const summary = {
    totalPosts: posts.length,
    approvedPosts: posts.filter((p) => p.status === "approved").length,
    scheduledPosts: posts.filter((p) => p.status === "scheduled").length,
    publishedPosts: posts.filter((p) => p.status === "published").length,
    needsReviewPosts: posts.filter((p) => p.status === "needs_review").length,
    queuedJobs: jobs.filter((j) => j.status === "queued" || j.status === "retrying" || j.status === "processing").length,
    failedJobs: jobs.filter((j) => j.status === "failed").length,
    latestScheduledAt,
  };

  return NextResponse.json({
    summary,
    mediaMode,
    subscription: {
      active: hasActiveSubscription(subscription),
      status: subscription?.status ?? "inactive",
      planCode: subscription?.planCode ?? "none",
      extraPostsPerWeek: subscription?.extraPostsPerWeek ?? 0,
      postsPerWeekAllowance: getPostsPerWeekAllowance(subscription),
    },
  });
}


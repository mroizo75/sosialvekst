import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { getLatestSubscription, getPostsPerWeekAllowance, hasActiveSubscription } from "@/lib/subscription";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const startOfNextMonth = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
};

export async function GET() {
  const userId = await requireUserId();
  const supabase = await createSupabaseServerClient();
  const nextMonth = startOfNextMonth().toISOString();

  const [postsResult, jobsResult, nextMonthPostsResult, subscription] = await Promise.all([
    supabase
      .from("posts")
      .select("status, scheduled_at")
      .eq("user_id", userId),
    supabase
      .from("publish_jobs")
      .select("status")
      .eq("user_id", userId),
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("scheduled_at", nextMonth),
    getLatestSubscription(userId),
  ]);

  const posts = postsResult.data ?? [];
  const jobs = jobsResult.data ?? [];
  const nextMonthPlanned = nextMonthPostsResult.count ?? 0;

  const summary = {
    totalPosts: posts.length,
    approvedPosts: posts.filter((p) => p.status === "approved").length,
    scheduledPosts: posts.filter((p) => p.status === "scheduled").length,
    publishedPosts: posts.filter((p) => p.status === "published").length,
    needsReviewPosts: posts.filter((p) => p.status === "needs_review").length,
    queuedJobs: jobs.filter((j) => j.status === "queued" || j.status === "retrying" || j.status === "processing").length,
    failedJobs: jobs.filter((j) => j.status === "failed").length,
    nextMonthPlanned,
  };

  return NextResponse.json({
    summary,
    subscription: {
      active: hasActiveSubscription(subscription),
      status: subscription?.status ?? "inactive",
      planCode: subscription?.planCode ?? "none",
      extraPostsPerWeek: subscription?.extraPostsPerWeek ?? 0,
      postsPerWeekAllowance: getPostsPerWeekAllowance(subscription),
    },
  });
}


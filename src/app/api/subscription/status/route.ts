import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { getLatestSubscription, getPostsPerWeekAllowance, hasActiveSubscription } from "@/lib/subscription";

export async function GET() {
  const userId = await requireUserId();
  const subscription = await getLatestSubscription(userId);

  return NextResponse.json({
    active: hasActiveSubscription(subscription),
    planCode: subscription?.planCode ?? "none",
    extraPostsPerWeek: subscription?.extraPostsPerWeek ?? 0,
    postsPerWeekAllowance: getPostsPerWeekAllowance(subscription),
    status: subscription?.status ?? "inactive",
  });
}


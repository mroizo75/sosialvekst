import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { getLatestSubscription, getPostsPerWeekAllowance, hasActiveSubscription } from "@/lib/subscription";
import { requireWorkspaceId } from "@/lib/workspace";

export async function GET() {
  const userId = await requireUserId();
  const workspaceId = await requireWorkspaceId(userId);
  const subscription = await getLatestSubscription(userId, workspaceId);

  return NextResponse.json({
    active: hasActiveSubscription(subscription),
    planCode: subscription?.planCode ?? "none",
    extraPostsPerWeek: subscription?.extraPostsPerWeek ?? 0,
    postsPerWeekAllowance: getPostsPerWeekAllowance(subscription),
    status: subscription?.status ?? "inactive",
  });
}

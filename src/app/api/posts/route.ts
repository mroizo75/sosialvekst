import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { listPosts } from "@/lib/posts/repository";
import { getAiEditLimits } from "@/lib/posts/aiEditLimits";
import { requireWorkspaceId } from "@/lib/workspace";

export async function GET() {
  const userId = await requireUserId();
  const workspaceId = await requireWorkspaceId(userId);
  const [posts, aiEdits] = await Promise.all([
    listPosts(userId, workspaceId),
    getAiEditLimits(userId, workspaceId),
  ]);
  return NextResponse.json({ posts, aiEdits });
}

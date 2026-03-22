import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { listPosts } from "@/lib/posts/repository";
import { getAiEditLimits } from "@/lib/posts/aiEditLimits";

export async function GET() {
  const userId = await requireUserId();
  const [posts, aiEdits] = await Promise.all([
    listPosts(userId),
    getAiEditLimits(userId),
  ]);
  return NextResponse.json({ posts, aiEdits });
}

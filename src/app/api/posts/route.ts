import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { listPosts } from "@/lib/posts/repository";

export async function GET() {
  const userId = await requireUserId();
  const posts = await listPosts(userId);
  return NextResponse.json({ posts });
}

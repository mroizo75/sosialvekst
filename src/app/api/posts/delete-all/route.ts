import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { deleteFilesByUrls } from "@/lib/cloudflare/r2";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  try {
    const userId = await requireUserId();
    const admin = createSupabaseAdminClient();

    const { data: posts, error: postsError } = await admin
      .from("posts")
      .select("image_url, video_url")
      .eq("user_id", userId);

    if (postsError) {
      return NextResponse.json(
        toAppError("POSTS_FETCH_FAILED", "Kunne ikke hente innlegg for sletting.", postsError.message),
        { status: 500 },
      );
    }

    const mediaUrls = (posts ?? [])
      .flatMap((post) => [post.image_url, post.video_url])
      .filter((url): url is string => Boolean(url));

    const { error: jobsDeleteError } = await admin
      .from("publish_jobs")
      .delete()
      .eq("user_id", userId);

    if (jobsDeleteError) {
      return NextResponse.json(
        toAppError("PUBLISH_JOBS_DELETE_FAILED", "Kunne ikke slette publiseringsjobber.", jobsDeleteError.message),
        { status: 500 },
      );
    }

    const { error: postsDeleteError } = await admin
      .from("posts")
      .delete()
      .eq("user_id", userId);

    if (postsDeleteError) {
      return NextResponse.json(
        toAppError("POSTS_DELETE_FAILED", "Kunne ikke slette innlegg.", postsDeleteError.message),
        { status: 500 },
      );
    }

    try {
      await deleteFilesByUrls(mediaUrls);
    } catch {
      // Do not fail cleanup response if remote storage deletion fails.
    }

    return NextResponse.json({ deleted: posts?.length ?? 0 });
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("DELETE_ALL_POSTS_FAILED", "Kunne ikke slette alle innlegg.", appError),
      { status: 400 },
    );
  }
}

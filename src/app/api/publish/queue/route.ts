import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { requireActiveSubscription } from "@/lib/subscription";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const queueSchema = z.object({
  postIds: z.array(z.string().uuid()).optional(),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await requireActiveSubscription(userId);
    const payload = queueSchema.parse(await request.json().catch(() => ({})));
    const supabase = await createSupabaseServerClient();

    let postsQuery = supabase
      .from("posts")
      .select("id, channel, scheduled_at, video_url")
      .eq("user_id", userId)
      .eq("status", "approved");

    if (payload.postIds && payload.postIds.length > 0) {
      postsQuery = postsQuery.in("id", payload.postIds);
    }

    const { data: posts, error: postsError } = await postsQuery;
    if (postsError) {
      return NextResponse.json(
        toAppError("POSTS_FETCH_FAILED", "Kunne ikke hente godkjente poster.", postsError.message),
        { status: 500 },
      );
    }

    if (!posts || posts.length === 0) {
      return NextResponse.json(
        toAppError("NO_APPROVED_POSTS", "Ingen godkjente poster klare for publiseringskø."),
        { status: 400 },
      );
    }

    const unsupportedLinkedInVideos = posts.filter(
      (post) => post.channel === "linkedin" && Boolean(post.video_url),
    );
    if (unsupportedLinkedInVideos.length > 0) {
      return NextResponse.json(
        toAppError(
          "LINKEDIN_VIDEO_NOT_SUPPORTED",
          "LinkedIn-video er ikke aktivert ennå. Velg bilde eller fjern video på LinkedIn-poster før kø.",
        ),
        { status: 400 },
      );
    }

    const requiredChannels = [...new Set(posts.map((post) => post.channel))];
    const { data: socialAccounts, error: socialError } = await supabase
      .from("social_accounts")
      .select("channel, access_token")
      .eq("user_id", userId)
      .in("channel", requiredChannels);

    if (socialError) {
      return NextResponse.json(
        toAppError("SOCIAL_FETCH_FAILED", "Kunne ikke verifisere tilkoblede sosiale kontoer.", socialError.message),
        { status: 500 },
      );
    }

    const validChannels = new Set(
      (socialAccounts ?? [])
        .filter((item) => item.access_token && !item.access_token.startsWith("pending-"))
        .map((item) => item.channel),
    );
    const missingChannels = requiredChannels.filter((channel) => !validChannels.has(channel));

    if (missingChannels.length > 0) {
      return NextResponse.json(
        toAppError(
          "MISSING_SOCIAL_ACCOUNTS",
          `Mangler gyldig sosial konto for: ${missingChannels.join(", ")}.`,
        ),
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();
    const queueRows = posts.map((post) => ({
      post_id: post.id,
      user_id: userId,
      channel: post.channel,
      run_at: post.scheduled_at < nowIso ? nowIso : post.scheduled_at,
      status: "queued",
      attempts: 0,
      last_error: null,
      updated_at: new Date().toISOString(),
    }));

    const { error: queueError } = await supabase
      .from("publish_jobs")
      .upsert(queueRows, { onConflict: "post_id" });

    if (queueError) {
      return NextResponse.json(
        toAppError("QUEUE_INSERT_FAILED", "Kunne ikke legge poster i publiseringskø.", queueError.message),
        { status: 500 },
      );
    }

    const { error: scheduleError } = await supabase
      .from("posts")
      .update({ status: "scheduled", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("id", posts.map((post) => post.id));

    if (scheduleError) {
      return NextResponse.json(
        toAppError("POST_SCHEDULE_FAILED", "Kunne ikke oppdatere poststatus til planlagt.", scheduleError.message),
        { status: 500 },
      );
    }

    return NextResponse.json({
      queued: posts.length,
    });
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("QUEUE_FAILED", "Kunne ikke opprette publiseringskø.", appError),
      { status: 400 },
    );
  }
}


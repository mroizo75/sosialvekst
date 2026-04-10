import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { toAppError, toUnknownAppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspaceId } from "@/lib/workspace";

const approveSchema = z.object({
  postIds: z.array(z.string().uuid()).min(1),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const workspaceId = await requireWorkspaceId(userId);
    const json = await request.json();
    const { postIds } = approveSchema.parse(json);
    const supabase = await createSupabaseServerClient();

    const { data: posts, error: fetchError } = await supabase
      .from("posts")
      .select("id, status, scheduled_at, channel, video_url")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .in("id", postIds);

    if (fetchError) {
      return NextResponse.json(
        toAppError("FETCH_FAILED", "Kunne ikke hente poster.", fetchError.message),
        { status: 500 },
      );
    }

    const now = new Date();
    const approvable = (posts ?? []).filter(
      (p) =>
        (p.status === "draft" || p.status === "needs_review") &&
        new Date(p.scheduled_at).getTime() > now.getTime(),
    );

    if (approvable.length === 0) {
      return NextResponse.json(
        toAppError("NO_APPROVABLE", "Ingen poster å godkjenne. Poster må ha status «utkast» og dato i fremtiden."),
        { status: 400 },
      );
    }

    const { error: updateError } = await supabase
      .from("posts")
      .update({ status: "approved", updated_at: now.toISOString() })
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .in("id", approvable.map((p) => p.id));

    if (updateError) {
      return NextResponse.json(
        toAppError("APPROVE_FAILED", "Kunne ikke godkjenne poster.", updateError.message),
        { status: 500 },
      );
    }

    const { data: socialAccounts, error: socialError } = await supabase
      .from("social_accounts")
      .select("channel, access_token")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId);

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

    const connectedApprovable = approvable.filter((post) => validChannels.has(post.channel));
    const publishableApprovable = connectedApprovable.filter((post) => {
      if (post.channel === "linkedin" && Boolean(post.video_url)) return false;
      if (post.channel === "tiktok" && !post.video_url) return false;
      return true;
    });

    if (publishableApprovable.length > 0) {
      const queueRows = publishableApprovable.map((post) => ({
        post_id: post.id,
        user_id: userId,
        workspace_id: workspaceId,
        channel: post.channel,
        run_at: post.scheduled_at,
        status: "queued",
        attempts: 0,
        last_error: null,
        updated_at: now.toISOString(),
      }));

      const { error: queueError } = await supabase
        .from("publish_jobs")
        .upsert(queueRows, { onConflict: "post_id" });

      if (queueError) {
        return NextResponse.json(
          toAppError("QUEUE_INSERT_FAILED", "Kunne ikke opprette publiseringskø ved godkjenning.", queueError.message),
          { status: 500 },
        );
      }

      const { error: scheduleError } = await supabase
        .from("posts")
        .update({ status: "scheduled", updated_at: now.toISOString() })
        .eq("user_id", userId)
        .eq("workspace_id", workspaceId)
        .in("id", publishableApprovable.map((post) => post.id));

      if (scheduleError) {
        return NextResponse.json(
          toAppError("POST_SCHEDULE_FAILED", "Kunne ikke oppdatere poststatus til planlagt.", scheduleError.message),
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      approved: approvable.length,
      scheduled: publishableApprovable.length,
      skipped: postIds.length - approvable.length,
    });
  } catch (error) {
    const appError = toUnknownAppError(error);
    return NextResponse.json(
      toAppError("APPROVE_ERROR", "Feil ved godkjenning.", appError),
      { status: 400 },
    );
  }
}

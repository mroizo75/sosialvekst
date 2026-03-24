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
      .select("id, status, scheduled_at")
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

    return NextResponse.json({
      approved: approvable.length,
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
